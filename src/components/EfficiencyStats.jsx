import { createSignal, onMount, onCleanup, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";

export default function EfficiencyStats() {
  const [stats, setStats] = createSignal(null);
  const [error, setError] = createSignal(false);

  onMount(() => {
    const fetchStats = async () => {
      try {
        const result = await invoke("get_energy_efficiency_stats");
        setStats(result);
      } catch (e) {
        setError(true);
      }
    };

    const interval = setInterval(fetchStats, 2000);
    fetchStats(); // initial call

    onCleanup(() => clearInterval(interval));
  });

  return (
    <Show when={stats() && !error()}>
      <div class="fixed bottom-4 right-4 p-3 bg-black/80 text-green-400 rounded-lg text-[10px] font-mono shadow-lg border border-green-900/50">
        <h3 class="font-bold mb-1 uppercase tracking-wider text-green-600">VisualTalk Pro Engine</h3>
        <div class="flex gap-4">
          <span>CPU: {stats()?.cpu_usage.toFixed(1)}%</span>
          <span>RAM: {(stats()?.memory_usage_bytes / 1024 / 1024).toFixed(0)} MB</span>
        </div>
      </div>
    </Show>
  );
}
