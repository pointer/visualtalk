import { createSignal } from "solid-js";

export function MainWindow(props) {
  const [roomInput, setRoomInput] = createSignal("");

  const handleJoin = () => {
    if (roomInput().trim()) {
      props.onJoinMeeting(roomInput().trim());
    }
  };

  return (
    <div class="flex h-screen w-screen bg-[#f0f2f5] text-gray-800">
      {/* Sidebar */}
      <aside class="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 space-y-6">
        <div class="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
          VT
        </div>
        <button class="p-3 rounded-lg hover:bg-gray-100 transition">
          <svg class="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
        </button>
        <button class="p-3 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition">
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
          </svg>
        </button>
        <button class="p-3 rounded-lg hover:bg-gray-100 transition">
          <svg class="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
            <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
          </svg>
        </button>
        <button class="p-3 rounded-lg hover:bg-gray-100 transition mt-auto">
          <svg class="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
          </svg>
        </button>
      </aside>

      {/* Main Content */}
      <main class="flex-1 p-8 overflow-y-auto">
        <header class="flex justify-between items-center mb-8">
          <h1 class="text-2xl font-semibold">VisualTalk</h1>
          <div class="flex items-center space-x-4">
            <span class="text-sm text-gray-500">Today, {new Date().toLocaleDateString()}</span>
            <img
              src="https://ui-avatars.com/api/?name=You"
              alt="Profile"
              class="w-8 h-8 rounded-full bg-gray-300"
            />
          </div>
        </header>

        {/* Action Cards */}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button
            onClick={() => props.onJoinMeeting("general")}
            class="p-6 bg-white rounded-xl shadow-sm hover:shadow-md transition flex flex-col items-center justify-center border border-gray-100"
          >
            <div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mb-3">
              <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <span class="font-medium">New Meeting</span>
          </button>

          <div class="p-6 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center">
            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-3">
              <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Enter room code"
              class="mt-2 px-3 py-2 border border-gray-300 rounded-lg text-sm w-full max-w-xs text-center"
              value={roomInput()}
              onInput={(e) => setRoomInput(e.currentTarget.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            <button
              onClick={handleJoin}
              class="mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition"
            >
              Join
            </button>
          </div>

          <button
            onClick={() => alert("Schedule feature coming soon!")}
            class="p-6 bg-white rounded-xl shadow-sm hover:shadow-md transition flex flex-col items-center justify-center border border-gray-100"
          >
            <div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mb-3">
              <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <span class="font-medium">Schedule</span>
          </button>
        </div>

        {/* Meeting List */}
        <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div class="flex justify-between items-center mb-4">
            <h2 class="font-semibold text-lg">Today's Meetings</h2>
            <button class="text-sm text-blue-600 hover:underline">View all</button>
          </div>
          <div class="text-center py-8 text-gray-500">
            <p>No meetings scheduled.</p>
            <button class="mt-2 text-blue-600 hover:underline text-sm">+ Schedule a meeting</button>
          </div>
        </div>
      </main>
    </div>
  );
}