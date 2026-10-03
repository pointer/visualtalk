//! End-to-End Encryption for VisualTalk chat & file transfers.
//!
//! Crypto stack (pure Rust, zero JS dependencies):
//!   Key Exchange  : ECDH P-256
//!   KDF           : HKDF-SHA-256
//!   Symmetric     : AES-256-GCM (12-byte IV, 128-bit auth tag)

use std::collections::HashMap;

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use p256::{ecdh::diffie_hellman, PublicKey, SecretKey};
use serde::{Deserialize, Serialize};
use sha2::{Sha256, Digest};
use tauri::State;

use crate::state::AppState;

const IV_LENGTH: usize = 12;
const AES_KEY_LENGTH: usize = 32;
const HKDF_INFO: &[u8] = b"visualtalk-e2ee-v1";

type E2eeResult<T> = Result<T, String>;

fn crypto_err(e: impl std::fmt::Display) -> String {
    format!("E2EE error: {}", e)
}

fn random_bytes<const N: usize>() -> E2eeResult<[u8; N]> {
    use rand::Rng;
    let mut buf = [0u8; N];
    rand::rng().fill_bytes(&mut buf);
    Ok(buf)
}

/// HMAC-SHA256 implemented manually using sha2::Digest to avoid
/// crypto-common version conflicts between hmac 0.13 and aes-gcm 0.10.
fn hmac_sha256(key: &[u8], message: &[u8]) -> [u8; 32] {
    const BLOCK_SIZE: usize = 64;

    // Prepare key: hash if too long, zero-pad to block size
    let mut k = [0u8; BLOCK_SIZE];
    if key.len() > BLOCK_SIZE {
        let hash = Sha256::digest(key);
        k[..32].copy_from_slice(&hash);
    } else {
        k[..key.len()].copy_from_slice(key);
    }

    // ipad = k XOR 0x36, opad = k XOR 0x5c
    let mut ipad = [0x36u8; BLOCK_SIZE];
    let mut opad = [0x5cu8; BLOCK_SIZE];
    for i in 0..BLOCK_SIZE {
        ipad[i] ^= k[i];
        opad[i] ^= k[i];
    }

    // Inner hash: SHA256(ipad || message)
    let mut inner = Sha256::new();
    inner.update(&ipad);
    inner.update(message);
    let inner_hash = inner.finalize();

    // Outer hash: SHA256(opad || inner_hash)
    let mut outer = Sha256::new();
    outer.update(&opad);
    outer.update(&inner_hash);
    let result = outer.finalize();

    let mut output = [0u8; 32];
    output.copy_from_slice(&result);
    output
}

/// HKDF-SHA256: Extract-then-Expand (single block, 32-byte output).
/// Avoids the hkdf crate to sidestep digest/crypto-common version conflicts.
fn hkdf_sha256(ikm: &[u8], salt: &[u8], info: &[u8]) -> [u8; 32] {
    // Extract: PRK = HMAC-SHA256(salt, IKM)
    let prk = hmac_sha256(salt, ikm);

    // Expand: T(1) = HMAC-SHA256(PRK, info || 0x01)
    let mut expand_input = Vec::with_capacity(info.len() + 1);
    expand_input.extend_from_slice(info);
    expand_input.push(0x01);
    hmac_sha256(&prk, &expand_input)
}

// ── IPC data structures ─────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WrappedKeyData {
    pub wrapped: String,
    pub iv: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedChatPayload {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub encrypted: bool,
    pub id: String,
    pub sender: String,
    pub sender_name: String,
    pub timestamp: i64,
    pub ciphertext: String,
    pub iv: String,
    pub wrapped_keys: HashMap<String, WrappedKeyData>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DecryptedChatData {
    #[serde(rename = "type")]
    pub msg_type: String,
    pub id: String,
    pub sender: String,
    pub sender_name: String,
    pub text: String,
    pub timestamp: i64,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct EncryptedChunkResult {
    pub iv: String,
    pub ciphertext: String,
}

// ── E2EESession ─────────────────────────────────────────────

pub struct E2EESession {
    local_identity: String,
    secret_key: SecretKey,
    public_key: PublicKey,
    peer_public_keys: HashMap<String, PublicKey>,
    shared_secrets: HashMap<String, [u8; AES_KEY_LENGTH]>,
    file_keys: HashMap<String, [u8; AES_KEY_LENGTH]>,
}

impl E2EESession {
    pub fn new(local_identity: String) -> E2eeResult<Self> {
        let secret_bytes = random_bytes::<32>()?;
        let secret_key = SecretKey::from_slice(&secret_bytes).map_err(crypto_err)?;
        let public_key = secret_key.public_key();
        Ok(Self {
            local_identity,
            secret_key,
            public_key,
            peer_public_keys: HashMap::new(),
            shared_secrets: HashMap::new(),
            file_keys: HashMap::new(),
        })
    }

    pub fn export_public_key_b64(&self) -> String {
        use p256::elliptic_curve::sec1::ToEncodedPoint;
        let raw = self.public_key.to_encoded_point(false);
        B64.encode(raw.as_bytes())
    }

    pub fn import_peer_key(&mut self, identity: &str, raw_key_b64: &str) -> E2eeResult<()> {
        let raw_key = B64.decode(raw_key_b64).map_err(crypto_err)?;
        let peer_public = PublicKey::from_sec1_bytes(&raw_key).map_err(crypto_err)?;
        self.peer_public_keys.insert(identity.to_string(), peer_public);

        let scalar = self.secret_key.to_nonzero_scalar();
        let shared = diffie_hellman(&scalar, peer_public.as_affine());
        let aes_key = hkdf_sha256(shared.raw_secret_bytes(), b"", HKDF_INFO);
        self.shared_secrets.insert(identity.to_string(), aes_key);
        Ok(())
    }

    pub fn get_peer_identities(&self) -> Vec<String> {
        self.peer_public_keys.keys().cloned().collect()
    }

    fn generate_file_key(&mut self, file_id: &str) -> E2eeResult<[u8; AES_KEY_LENGTH]> {
        let key = random_bytes::<AES_KEY_LENGTH>()?;
        self.file_keys.insert(file_id.to_string(), key);
        Ok(key)
    }

    pub fn set_file_key(&mut self, file_id: &str, key: [u8; AES_KEY_LENGTH]) {
        self.file_keys.insert(file_id.to_string(), key);
    }

    pub fn remove_file_key(&mut self, file_id: &str) {
        self.file_keys.remove(file_id);
    }

    fn aes_encrypt(
        plaintext: &[u8],
        key_bytes: &[u8; AES_KEY_LENGTH],
    ) -> E2eeResult<(Vec<u8>, [u8; IV_LENGTH])> {
        let key = Key::<Aes256Gcm>::from_slice(key_bytes);
        let cipher = Aes256Gcm::new(key);
        let iv = random_bytes::<IV_LENGTH>()?;
        let nonce = Nonce::from_slice(&iv);
        let ct = cipher.encrypt(nonce, plaintext).map_err(crypto_err)?;
        Ok((ct, iv))
    }

    fn aes_decrypt(
        ciphertext: &[u8],
        iv: &[u8; IV_LENGTH],
        key_bytes: &[u8; AES_KEY_LENGTH],
    ) -> E2eeResult<Vec<u8>> {
        let key = Key::<Aes256Gcm>::from_slice(key_bytes);
        let cipher = Aes256Gcm::new(key);
        let nonce = Nonce::from_slice(iv);
        cipher.decrypt(nonce, ciphertext).map_err(crypto_err)
    }

    fn wrap_key(
        &self,
        key_to_wrap: &[u8; AES_KEY_LENGTH],
        peer: &str,
    ) -> E2eeResult<(Vec<u8>, [u8; IV_LENGTH])> {
        let shared = self.shared_secrets.get(peer)
            .ok_or_else(|| format!("No shared secret with peer: {}", peer))?;
        Self::aes_encrypt(key_to_wrap, shared)
    }

    fn unwrap_key(
        &self,
        wrapped: &[u8],
        iv: &[u8; IV_LENGTH],
        sender: &str,
    ) -> E2eeResult<[u8; AES_KEY_LENGTH]> {
        let shared = self.shared_secrets.get(sender)
            .ok_or_else(|| format!("No shared secret with sender: {}", sender))?;
        let raw = Self::aes_decrypt(wrapped, iv, shared)?;
        if raw.len() != AES_KEY_LENGTH {
            return Err(format!("Invalid unwrapped key length: {}", raw.len()));
        }
        let mut key = [0u8; AES_KEY_LENGTH];
        key.copy_from_slice(&raw);
        Ok(key)
    }

    // ── Chat message encrypt ────────────────────────────

    pub fn encrypt_chat(
        &self,
        text: &str,
        sender: &str,
        sender_name: &str,
    ) -> E2eeResult<EncryptedChatPayload> {
        let timestamp = chrono::Utc::now().timestamp_millis();
        let rnd = random_bytes::<4>()?;
        let id = format!("msg-{}-{:x}", timestamp, u32::from_le_bytes(rnd));

        let plaintext = serde_json::json!({
            "type": "chat", "id": id, "sender": sender,
            "senderName": sender_name, "text": text, "timestamp": timestamp,
        });
        let pt_bytes = serde_json::to_vec(&plaintext).map_err(crypto_err)?;

        let msg_key = random_bytes::<AES_KEY_LENGTH>()?;
        let (ciphertext, iv) = Self::aes_encrypt(&pt_bytes, &msg_key)?;

        let mut wrapped_keys = HashMap::new();
        for peer in self.get_peer_identities() {
            if let Ok((w, wiv)) = self.wrap_key(&msg_key, &peer) {
                wrapped_keys.insert(peer, WrappedKeyData {
                    wrapped: B64.encode(&w), iv: B64.encode(wiv),
                });
            }
        }

        Ok(EncryptedChatPayload {
            msg_type: "chat".into(), encrypted: true, id,
            sender: sender.into(), sender_name: sender_name.into(),
            timestamp, ciphertext: B64.encode(&ciphertext),
            iv: B64.encode(iv), wrapped_keys,
        })
    }

    // ── Chat message decrypt ────────────────────────────

    pub fn decrypt_chat(
        &self,
        ct_b64: &str,
        iv_b64: &str,
        wrapped_keys: &HashMap<String, WrappedKeyData>,
        sender: &str,
    ) -> E2eeResult<DecryptedChatData> {
        let ct = B64.decode(ct_b64).map_err(crypto_err)?;
        let iv_raw = B64.decode(iv_b64).map_err(crypto_err)?;
        let iv: [u8; IV_LENGTH] = iv_raw.try_into()
            .map_err(|_| "Invalid IV length".to_string())?;

        let my_data = wrapped_keys.get(&self.local_identity)
            .ok_or("No wrapped key for this participant")?;
        let wrapped = B64.decode(&my_data.wrapped).map_err(crypto_err)?;
        let wiv_raw = B64.decode(&my_data.iv).map_err(crypto_err)?;
        let wiv: [u8; IV_LENGTH] = wiv_raw.try_into()
            .map_err(|_| "Invalid wrap IV length".to_string())?;

        let msg_key = self.unwrap_key(&wrapped, &wiv, sender)?;
        let pt = Self::aes_decrypt(&ct, &iv, &msg_key)?;
        let j: serde_json::Value = serde_json::from_slice(&pt).map_err(crypto_err)?;

        Ok(DecryptedChatData {
            msg_type: j["type"].as_str().unwrap_or("chat").into(),
            id: j["id"].as_str().unwrap_or("").into(),
            sender: j["sender"].as_str().unwrap_or("").into(),
            sender_name: j["senderName"].as_str().unwrap_or("").into(),
            text: j["text"].as_str().unwrap_or("").into(),
            timestamp: j["timestamp"].as_i64().unwrap_or(0),
        })
    }

    // ── File transfer preparation ───────────────────────

    pub fn prepare_file_transfer(
        &mut self,
        file_id: &str,
    ) -> E2eeResult<HashMap<String, WrappedKeyData>> {
        let file_key = self.generate_file_key(file_id)?;
        let mut wrapped_keys = HashMap::new();
        for peer in self.get_peer_identities() {
            if let Ok((w, wiv)) = self.wrap_key(&file_key, &peer) {
                wrapped_keys.insert(peer, WrappedKeyData {
                    wrapped: B64.encode(&w), iv: B64.encode(wiv),
                });
            }
        }
        Ok(wrapped_keys)
    }

    pub fn unwrap_file_key_from_sender(
        &mut self,
        file_id: &str,
        wrapped_b64: &str,
        iv_b64: &str,
        sender: &str,
    ) -> E2eeResult<()> {
        let wrapped = B64.decode(wrapped_b64).map_err(crypto_err)?;
        let iv_raw = B64.decode(iv_b64).map_err(crypto_err)?;
        let iv: [u8; IV_LENGTH] = iv_raw.try_into()
            .map_err(|_| "Invalid IV length".to_string())?;
        let file_key = self.unwrap_key(&wrapped, &iv, sender)?;
        self.set_file_key(file_id, file_key);
        Ok(())
    }

    // ── Chunk encrypt / decrypt ─────────────────────────

    pub fn encrypt_chunk(
        &self,
        file_id: &str,
        data_b64: &str,
    ) -> E2eeResult<EncryptedChunkResult> {
        let pt = B64.decode(data_b64).map_err(crypto_err)?;
        let (ct, iv) = self.encrypt_with_file_key(file_id, &pt)?;
        Ok(EncryptedChunkResult {
            iv: B64.encode(iv),
            ciphertext: B64.encode(&ct),
        })
    }

    pub fn decrypt_chunk(
        &self,
        file_id: &str,
        iv_b64: &str,
        ct_b64: &str,
    ) -> E2eeResult<String> {
        let iv_raw = B64.decode(iv_b64).map_err(crypto_err)?;
        let iv: [u8; IV_LENGTH] = iv_raw.try_into()
            .map_err(|_| "Invalid IV length".to_string())?;
        let ct = B64.decode(ct_b64).map_err(crypto_err)?;
        let pt = self.decrypt_with_file_key(file_id, &ct, &iv)?;
        Ok(B64.encode(&pt))
    }

    fn encrypt_with_file_key(
        &self,
        file_id: &str,
        pt: &[u8],
    ) -> E2eeResult<(Vec<u8>, [u8; IV_LENGTH])> {
        let key = self.file_keys.get(file_id)
            .ok_or_else(|| format!("No file key for: {}", file_id))?;
        Self::aes_encrypt(pt, key)
    }

    fn decrypt_with_file_key(
        &self,
        file_id: &str,
        ct: &[u8],
        iv: &[u8; IV_LENGTH],
    ) -> E2eeResult<Vec<u8>> {
        let key = self.file_keys.get(file_id)
            .ok_or_else(|| format!("No file key for: {}", file_id))?;
        Self::aes_decrypt(ct, iv, key)
    }
} // end impl E2EESession

// ═══════════════════════════════════════════════════════════
// Tauri Commands
// ═══════════════════════════════════════════════════════════

#[tauri::command]
pub fn e2ee_init(local_identity: String, state: State<'_, AppState>) -> E2eeResult<String> {
    let mut guard = state.e2ee_session.lock().map_err(|e| e.to_string())?;
    let session = E2EESession::new(local_identity)?;
    let pub_key_b64 = session.export_public_key_b64();
    *guard = Some(session);
    Ok(pub_key_b64)
}

#[tauri::command]
pub fn e2ee_import_peer(identity: String, public_key_b64: String, state: State<'_, AppState>) -> E2eeResult<()> {
    let mut guard = state.e2ee_session.lock().map_err(|e| e.to_string())?;
    let session = guard.as_mut().ok_or("E2EE session not initialized")?;
    session.import_peer_key(&identity, &public_key_b64)
}

#[tauri::command]
pub fn e2ee_encrypt_chat(text: String, sender: String, sender_name: String, state: State<'_, AppState>) -> E2eeResult<EncryptedChatPayload> {
    let guard = state.e2ee_session.lock().map_err(|e| e.to_string())?;
    guard.as_ref().ok_or("E2EE session not initialized")?.encrypt_chat(&text, &sender, &sender_name)
}

#[tauri::command]
pub fn e2ee_decrypt_chat(
    ciphertext_b64: String, iv_b64: String,
    wrapped_keys: HashMap<String, WrappedKeyData>,
    sender: String, state: State<'_, AppState>,
) -> E2eeResult<DecryptedChatData> {
    let guard = state.e2ee_session.lock().map_err(|e| e.to_string())?;
    guard.as_ref().ok_or("E2EE session not initialized")?.decrypt_chat(&ciphertext_b64, &iv_b64, &wrapped_keys, &sender)
}

#[tauri::command]
pub fn e2ee_prepare_file(file_id: String, state: State<'_, AppState>) -> E2eeResult<HashMap<String, WrappedKeyData>> {
    let mut guard = state.e2ee_session.lock().map_err(|e| e.to_string())?;
    guard.as_mut().ok_or("E2EE session not initialized")?.prepare_file_transfer(&file_id)
}

#[tauri::command]
pub fn e2ee_unwrap_file_key(file_id: String, wrapped_b64: String, iv_b64: String, sender: String, state: State<'_, AppState>) -> E2eeResult<()> {
    let mut guard = state.e2ee_session.lock().map_err(|e| e.to_string())?;
    guard.as_mut().ok_or("E2EE session not initialized")?.unwrap_file_key_from_sender(&file_id, &wrapped_b64, &iv_b64, &sender)
}

#[tauri::command]
pub fn e2ee_encrypt_chunk(file_id: String, data: String, state: State<'_, AppState>) -> E2eeResult<EncryptedChunkResult> {
    let guard = state.e2ee_session.lock().map_err(|e| e.to_string())?;
    guard.as_ref().ok_or("E2EE session not initialized")?.encrypt_chunk(&file_id, &data)
}

#[tauri::command]
pub fn e2ee_decrypt_chunk(file_id: String, iv_b64: String, ciphertext_b64: String, state: State<'_, AppState>) -> E2eeResult<String> {
    let guard = state.e2ee_session.lock().map_err(|e| e.to_string())?;
    guard.as_ref().ok_or("E2EE session not initialized")?.decrypt_chunk(&file_id, &iv_b64, &ciphertext_b64)
}

#[tauri::command]
pub fn e2ee_cleanup_file(file_id: String, state: State<'_, AppState>) -> E2eeResult<()> {
    let mut guard = state.e2ee_session.lock().map_err(|e| e.to_string())?;
    guard.as_mut().ok_or("E2EE session not initialized")?.remove_file_key(&file_id);
    Ok(())
}

#[tauri::command]
pub fn e2ee_destroy(state: State<'_, AppState>) -> E2eeResult<()> {
    let mut guard = state.e2ee_session.lock().map_err(|e| e.to_string())?;
    *guard = None;
    Ok(())
}