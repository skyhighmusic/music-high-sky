import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  MessageSquare,
  Radio,
  Send,
  Trash2,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Sparkles,
  Volume2,
  Globe,
  ExternalLink,
  Search,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import { apiFetchJson } from '../utils/apiClient';

type AssistantTab = 'chat' | 'search' | 'voice';

interface GroundedWebSource {
  title: string;
  uri: string;
}

interface ChatMsg {
  id: string;
  role: 'user' | 'model';
  text: string;
  model?: string;
  sources?: GroundedWebSource[];
}

interface SqlChatRow {
  id: number;
  role: 'user' | 'model';
  model: string;
  content: string;
}

const MODEL_OPTIONS = [
  { id: 'gemini-4-hydrogen', label: 'Gemini 4 Hydrogen', note: 'General A&R & Strategy (Default)' },
  { id: 'gemini-4-carbon', label: 'Gemini 4 Carbon', note: 'Deep Reasoning & Contracts' },
  { id: 'gemini-4-neon', label: 'Gemini 4 Neon', note: 'Complex Campaign Planning' },
  { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite', note: 'Ultra-Fast Responses' },
];

const QUICK_PROMPTS = [
  'Draft a 21-day Indian & global rollout plan for Sunil Kumar’s next Hindi emotional single.',
  'Create an ISRC, UPC, and credit verification checklist before delivering to Spotify and JioSaavn.',
  'Suggest 5 high-retention Instagram Reels concepts for a Haryanvi motivational anthem.',
];

// Downsample Float32 audio from native sample rate to 16kHz Int16 PCM base64
function downsampleToPcm16Base64(buffer: Float32Array, inputRate: number, targetRate = 16000): string {
  const ratio = inputRate / targetRate;
  const outputLength = Math.max(1, Math.round(buffer.length / ratio));
  const int16 = new Int16Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(buffer.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    let count = 0;
    for (let j = start; j < end; j++) {
      sum += buffer[j];
      count++;
    }
    const sample = count > 0 ? sum / count : buffer[Math.min(start, buffer.length - 1)] || 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert base64 24kHz Int16 PCM to Float32Array
function decodePcm24ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768;
  }
  return float32;
}

export const AiAssistantView: React.FC = () => {
  const { pushToast } = usePlatform();
  const [activeTab, setActiveTab] = useState<AssistantTab>('chat');

  // =========================================================================
  // 1. MULTI-TURN LABEL STRATEGY CHATBOT
  // =========================================================================
  const [selectedModel, setSelectedModel] = useState('gemini-4-hydrogen');
  const [chatSearchGrounding, setChatSearchGrounding] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // =========================================================================
  // 1B. LIVE WEB RESEARCH (GEMINI 4 HYDROGEN + GOOGLE SEARCH GROUNDING)
  // =========================================================================
  const [searchQuery, setSearchQuery] = useState(
    'What are the latest Spotify for Artists and YouTube Music pitch submission requirements and indie royalty trends in India?'
  );
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchResult, setSearchResult] = useState<{
    text: string;
    sources: GroundedWebSource[];
    queries: string[];
    model: string;
  } | null>(null);

  const runSearchGrounding = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? searchQuery).trim();
    if (!q || searchBusy) return;
    if (overrideQuery) setSearchQuery(overrideQuery);
    setSearchBusy(true);
    try {
      const res = await apiFetchJson<{
        model: string;
        text: string;
        sources: GroundedWebSource[];
        queries: string[];
      }>('/api/ai/search-grounding', {
        method: 'POST',
        body: { query: q },
      });
      setSearchResult(res);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Google Search grounding failed.', 'error');
    } finally {
      setSearchBusy(false);
    }
  };

  const loadChatHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await apiFetchJson<{ messages: SqlChatRow[] }>('/api/sql/chat?sessionId=default');
      const loaded: ChatMsg[] = (res.messages ?? []).map((row) => ({
        id: String(row.id),
        role: row.role,
        text: row.content,
        model: row.model,
      }));
      setMessages(loaded);
    } catch {
      // Proceed with clean local thread if history unavailable
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadChatHistory();
  }, [loadChatHistory]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatLoading]);

  const sendChatMessage = async (overrideText?: string) => {
    const content = (overrideText ?? chatInput).trim();
    if (!content || chatLoading) return;

    const userMsg: ChatMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: content,
    };
    const nextThread = [...messages, userMsg];
    setMessages(nextThread);
    if (!overrideText) setChatInput('');
    setChatLoading(true);

    try {
      const res = await apiFetchJson<{
        reply: string;
        model: string;
        sources?: GroundedWebSource[];
      }>('/api/ai/chat', {
        method: 'POST',
        body: {
          model: chatSearchGrounding ? 'gemini-4-hydrogen' : selectedModel,
          enableWebSearch: chatSearchGrounding,
          sessionId: 'default',
          messages: nextThread.map((m) => ({ role: m.role, text: m.text })),
        },
      });
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: res.reply,
          model: res.model,
          sources: res.sources && res.sources.length > 0 ? res.sources : undefined,
        },
      ]);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Assistant request failed.', 'error');
    } finally {
      setChatLoading(false);
    }
  };

  const handleClearChat = async () => {
    setMessages([]);
    try {
      await apiFetchJson('/api/sql/chat?sessionId=default', { method: 'DELETE' });
      pushToast('Conversation cleared.', 'info');
    } catch {
      // local state already cleared
    }
  };

  // =========================================================================
  // 2. LIVE VOICE STUDIO (GEMINI 3.8 LIVE VIA WEBSOCKET)
  // =========================================================================
  const [voiceState, setVoiceState] = useState<'idle' | 'connecting' | 'live'>('idle');
  const [micMuted, setMicMuted] = useState(false);
  const micMutedRef = useRef(false);
  const [micLevel, setMicLevel] = useState(0);
  const [voiceTranscripts, setVoiceTranscripts] = useState<
    Array<{ id: string; speaker: 'You' | 'Studio Advisor'; text: string }>
  >([]);

  const wsRef = useRef<WebSocket | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);
  const playbackCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);

  const flushPlaybackQueue = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    }
    activeSourcesRef.current = [];
    if (playbackCtxRef.current) {
      nextStartTimeRef.current = playbackCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
  }, []);

  const stopLiveVoice = useCallback(() => {
    flushPlaybackQueue();
    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'close' }));
      }
      wsRef.current?.close();
    } catch {
      // ignore
    }
    wsRef.current = null;

    try {
      processorRef.current?.disconnect();
    } catch {
      // ignore
    }
    processorRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    mediaStreamRef.current = null;

    captureCtxRef.current?.close().catch(() => {});
    captureCtxRef.current = null;

    playbackCtxRef.current?.close().catch(() => {});
    playbackCtxRef.current = null;

    setMicLevel(0);
    setVoiceState('idle');
  }, [flushPlaybackQueue]);

  useEffect(() => {
    return () => {
      stopLiveVoice();
    };
  }, [stopLiveVoice]);

  const appendVoiceLine = (speaker: 'You' | 'Studio Advisor', text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setVoiceTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text} ${trimmed}`.trim() },
        ];
      }
      return [...prev, { id: `${Date.now()}-${Math.random()}`, speaker, text: trimmed }];
    });
  };

  const schedulePcmPlayback = useCallback((base64Pcm: string) => {
    const ctx = playbackCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const samples = decodePcm24ToFloat32(base64Pcm);
    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.02, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
    };
  }, []);

  const startLiveVoice = async () => {
    if (voiceState !== 'idle') return;
    setVoiceState('connecting');
    setVoiceTranscripts([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const captureCtx = new AudioContext();
      captureCtxRef.current = captureCtx;

      const playbackCtx = new AudioContext({ sampleRate: 24000 });
      playbackCtxRef.current = playbackCtx;
      nextStartTimeRef.current = playbackCtx.currentTime;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/live-voice`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(String(event.data)) as {
            type: string;
            data?: string;
            text?: string;
            message?: string;
          };
          if (msg.type === 'ready') {
            setVoiceState('live');
            pushToast('Live Voice Studio connected. Start speaking!', 'success');
          } else if (msg.type === 'audio' && msg.data) {
            schedulePcmPlayback(msg.data);
          } else if (msg.type === 'interrupted') {
            flushPlaybackQueue();
          } else if (msg.type === 'inputTranscript' && msg.text) {
            appendVoiceLine('You', msg.text);
          } else if (msg.type === 'outputTranscript' && msg.text) {
            appendVoiceLine('Studio Advisor', msg.text);
          } else if (msg.type === 'error') {
            pushToast(msg.message || 'Live voice error.', 'error');
            stopLiveVoice();
          } else if (msg.type === 'closed') {
            stopLiveVoice();
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        pushToast('Unable to maintain Live Voice connection.', 'error');
        stopLiveVoice();
      };

      ws.onclose = () => {
        setVoiceState('idle');
      };

      const sourceNode = captureCtx.createMediaStreamSource(stream);
      const processor = captureCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (micMutedRef.current) {
          setMicLevel(0);
          return;
        }
        const input = e.inputBuffer.getChannelData(0);
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) {
          sumSq += input[i] * input[i];
        }
        const rms = Math.sqrt(sumSq / input.length);
        setMicLevel(Math.min(1, rms * 5));

        if (ws.readyState === WebSocket.OPEN) {
          const base64 = downsampleToPcm16Base64(input, captureCtx.sampleRate, 16000);
          ws.send(JSON.stringify({ type: 'audio', data: base64 }));
        }
      };

      sourceNode.connect(processor);
      processor.connect(captureCtx.destination);
    } catch {
      pushToast('Microphone access is required for Live Voice Studio.', 'error');
      stopLiveVoice();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#00D5FF]">
            Music High Sky · Executive Intelligence
          </p>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-gold-gradient mt-1">
            A&amp;R Strategy Chat &amp; Live Voice Studio
          </h1>
          <p className="text-sm text-[#C8D0DB] mt-1 max-w-2xl">
            Consult your label advisor through multi-turn text sessions or speak in real time via bidirectional Live Voice.
          </p>
        </div>

        <div className="flex flex-wrap rounded-xl bg-[#030509] p-1 border border-[#D4AF37]/30 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-gradient-to-r from-[#F5D58A] to-[#D4AF37] text-[#030509]'
                : 'text-[#C8D0DB] hover:text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Strategy Chat
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('search')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'search'
                ? 'bg-gradient-to-r from-[#00A8FF] to-[#00D5FF] text-[#020817]'
                : 'text-[#C8D0DB] hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4" />
            Web Research
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('voice')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === 'voice'
                ? 'bg-gradient-to-r from-[#00A8FF] to-[#00D5FF] text-[#020817]'
                : 'text-[#C8D0DB] hover:text-white'
            }`}
          >
            <Radio className="w-4 h-4" />
            Live Voice Studio
          </button>
        </div>
      </div>

      {/* ================= MULTI-TURN CHAT TAB ================= */}
      {activeTab === 'chat' && (
        <section className="luxury-card rounded-2xl overflow-hidden flex flex-col h-[72vh] min-h-[540px]">
          {/* Model Selector & Live Search Grounding Bar */}
          <div className="px-5 py-3.5 border-b border-[#D4AF37]/20 bg-[#030509]/80 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-wrap">
              <label
                htmlFor="chat-model-select"
                className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#F5D58A]"
              >
                Intelligence Tier
              </label>
              <select
                id="chat-model-select"
                value={chatSearchGrounding ? 'gemini-4-hydrogen' : selectedModel}
                disabled={chatSearchGrounding}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="rounded-lg luxury-input px-3 py-1.5 text-xs font-medium disabled:opacity-70"
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} — {opt.note}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => {
                  setChatSearchGrounding((prev) => {
                    const next = !prev;
                    if (next) setSelectedModel('gemini-4-hydrogen');
                    return next;
                  });
                }}
                aria-pressed={chatSearchGrounding}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                  chatSearchGrounding
                    ? 'bg-[#00A8FF]/20 border-[#00D5FF]/65 text-[#00D5FF]'
                    : 'bg-[#06152E] border-[#D4AF37]/25 text-[#C8D0DB] hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>{chatSearchGrounding ? 'Google Search: On' : 'Google Search: Off'}</span>
              </button>
            </div>

            {messages.length > 0 && (
              <button
                type="button"
                onClick={handleClearChat}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-[#C8D0DB] hover:text-rose-300 hover:bg-rose-950/30 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Thread
              </button>
            )}
          </div>

          {/* Scrollable Message Thread */}
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
            {historyLoading ? (
              <div className="h-full flex items-center justify-center text-xs text-[#8D9AAA] gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#00D5FF]" />
                Restoring conversation history...
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center max-w-xl mx-auto space-y-5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#D4AF37]/25 to-[#00A8FF]/20 border border-[#D4AF37]/40 flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-[#F5D58A]" />
                </div>
                <div className="space-y-1.5">
                  <h2 className="font-display text-lg font-bold text-white">
                    Music High Sky Executive Advisor
                  </h2>
                  <p className="text-xs text-[#8D9AAA] leading-relaxed">
                    Ask anything about release calendars, DSP pitching, Hindi &amp; Haryanvi rollout campaigns, metadata compliance, or songwriting direction.
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-2.5 w-full">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void sendChatMessage(q)}
                      className="text-left px-4 py-3 rounded-xl bg-[#030509]/80 border border-[#D4AF37]/20 hover:border-[#00A8FF]/55 text-xs text-[#C8D0DB] hover:text-white transition-all cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-[#0759C7]/80 to-[#06152E] border border-[#00A8FF]/45 text-white'
                        : 'bg-[#030509]/90 border border-[#D4AF37]/25 text-[#E8EDF5]'
                    }`}
                  >
                    {msg.role === 'model' && (
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#F5D58A] mb-1.5">
                        Music High Sky Advisor {msg.model ? `· ${msg.model}` : ''}
                      </p>
                    )}
                    {msg.text}
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-[#D4AF37]/15 space-y-1.5">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#00D5FF]">
                          Grounded Web Sources
                        </p>
                        <div className="flex flex-col gap-1">
                          {msg.sources.map((src) => (
                            <a
                              key={src.uri}
                              href={src.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs text-[#00D5FF] hover:text-[#F5D58A] underline underline-offset-2 truncate"
                            >
                              <ExternalLink className="w-3 h-3 shrink-0" />
                              <span className="truncate">{src.title}</span>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="rounded-2xl bg-[#030509]/90 border border-[#D4AF37]/25 px-4 py-3 text-xs text-[#00D5FF] inline-flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Composing response...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendChatMessage();
            }}
            className="p-4 border-t border-[#D4AF37]/20 bg-[#030509]/90 flex items-center gap-3"
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about release strategy, DSP pitching, lyrics, royalties, or marketing..."
              className="flex-1 rounded-xl luxury-input px-4 py-3 text-sm"
            />
            <button
              type="submit"
              disabled={chatLoading || !chatInput.trim()}
              className="btn-gold inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs uppercase tracking-[0.12em] cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </section>
      )}

      {/* ================= LIVE WEB RESEARCH (GOOGLE SEARCH GROUNDING) TAB ================= */}
      {activeTab === 'search' && (
        <section className="luxury-card rounded-2xl p-6 space-y-5">
          <div>
            <p className="text-xs font-semibold text-[#00D5FF] mb-1">
              Gemini 4 Hydrogen · Real-Time Google Search Grounding
            </p>
            <h2 className="font-display text-xl font-bold text-gold-gradient">
              Live Music Industry &amp; DSP Web Research
            </h2>
            <p className="text-xs text-[#8D9AAA] mt-1">
              Query current streaming platform guidelines, Indian &amp; global music chart trends, royalty updates, and festival deadlines backed by verified Google Search sources.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runSearchGrounding();
            }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-[#00D5FF] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ask a real-time music industry, chart, DSP policy, or festival question..."
                className="w-full pl-10 pr-4 py-3 text-sm luxury-input rounded-xl"
              />
            </div>
            <button
              type="submit"
              disabled={searchBusy || !searchQuery.trim()}
              className="btn-gold px-5 py-3 text-xs rounded-xl inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer disabled:opacity-50"
            >
              {searchBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Globe className="w-4 h-4" />
              )}
              <span>{searchBusy ? 'Searching Web...' : 'Search with Google'}</span>
            </button>
          </form>

          <div className="flex flex-wrap gap-2">
            {[
              'Latest Spotify for Artists editorial pitching lead time and best practices',
              'Upcoming Indian independent music festivals and artist submission windows',
              'YouTube Content ID and Official Artist Channel eligibility requirements',
            ].map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={searchBusy}
                onClick={() => void runSearchGrounding(preset)}
                className="text-left px-3 py-1.5 rounded-lg bg-[#030509]/80 border border-[#D4AF37]/20 hover:border-[#00D5FF]/55 text-xs text-[#C8D0DB] hover:text-white transition-colors cursor-pointer"
              >
                {preset}
              </button>
            ))}
          </div>

          {searchResult && (
            <div className="space-y-4 pt-2 border-t border-[#D4AF37]/15">
              <div className="p-5 rounded-xl bg-[#030509]/85 border border-[#D4AF37]/20 text-sm text-[#E8EDF5] whitespace-pre-wrap leading-relaxed">
                {searchResult.text}
              </div>

              {searchResult.sources.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-[#F5D58A]">
                    Verified Web Citations ({searchResult.sources.length})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {searchResult.sources.map((src) => (
                      <a
                        key={src.uri}
                        href={src.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-3 rounded-xl bg-[#030509]/75 border border-[#00A8FF]/25 hover:border-[#00D5FF] flex items-center justify-between gap-2 text-xs text-[#00D5FF] hover:text-white transition-colors"
                      >
                        <span className="truncate font-medium">{src.title}</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ================= LIVE VOICE STUDIO TAB ================= */}
      {activeTab === 'voice' && (
        <section className="luxury-card rounded-2xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col items-center text-center space-y-5 max-w-2xl mx-auto">
            <div className="relative flex items-center justify-center">
              <div
                className="w-32 h-32 rounded-full flex items-center justify-center transition-transform duration-100 border-2 border-[#D4AF37]/50 bg-gradient-to-br from-[#06152E] via-[#020817] to-[#030509]"
                style={{
                  transform:
                    voiceState === 'live' ? `scale(${1 + Math.min(0.18, micLevel * 0.28)})` : 'scale(1)',
                  boxShadow:
                    voiceState === 'live'
                      ? `0 0 ${28 + Math.round(micLevel * 45)}px rgba(0, 168, 255, 0.45)`
                      : '0 0 24px -10px rgba(212, 175, 55, 0.4)',
                }}
              >
                <Volume2
                  className={`w-12 h-12 ${
                    voiceState === 'live' ? 'text-[#00D5FF]' : 'text-[#F5D58A]'
                  }`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <h2 className="font-display text-xl font-bold text-gold-gradient">
                Real-Time Studio Voice Session
              </h2>
              <p className="text-xs text-[#C8D0DB] leading-relaxed">
                Speak directly with your Music High Sky Executive A&amp;R voice partner. You can interrupt naturally at any moment.
              </p>
            </div>

            {/* Live Spectrum Bars */}
            <div className="flex items-end justify-center gap-1.5 h-12" aria-hidden="true">
              {Array.from({ length: 18 }).map((_, i) => {
                const factor = Math.sin((i / 17) * Math.PI);
                const heightPx =
                  voiceState === 'live'
                    ? Math.max(8, Math.round(10 + factor * micLevel * 38))
                    : 8;
                return (
                  <span
                    key={i}
                    className="w-1.5 rounded-full bg-gradient-to-t from-[#0759C7] via-[#00A8FF] to-[#F5D58A] transition-all duration-75"
                    style={{ height: `${heightPx}px` }}
                  />
                );
              })}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center justify-center gap-3">
              {voiceState === 'idle' ? (
                <button
                  type="button"
                  onClick={startLiveVoice}
                  className="btn-gold inline-flex items-center gap-2.5 px-6 py-3 rounded-xl text-xs uppercase tracking-[0.14em] cursor-pointer"
                >
                  <Mic className="w-4 h-4" />
                  Start Voice Conversation
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={voiceState === 'connecting'}
                    onClick={() => setMicMuted((m) => !m)}
                    className="btn-electric inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-60"
                  >
                    {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {micMuted ? 'Unmute Mic' : 'Mute Mic'}
                  </button>
                  <button
                    type="button"
                    onClick={stopLiveVoice}
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-semibold bg-rose-600/90 hover:bg-rose-500 text-white transition-colors cursor-pointer"
                  >
                    <PhoneOff className="w-4 h-4" />
                    End Session
                  </button>
                </>
              )}
            </div>

            {voiceState === 'connecting' && (
              <p className="text-xs text-[#00D5FF] inline-flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Establishing bidirectional audio link...
              </p>
            )}
          </div>

          {/* Live Transcript Panel */}
          <div className="rounded-xl bg-[#030509]/85 border border-[#D4AF37]/20 p-5 space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#F5D58A]">
              Live Transcript
            </p>
            {voiceTranscripts.length === 0 ? (
              <p className="text-xs text-[#8D9AAA]">
                Start a session and speak into your microphone — real-time transcripts from both speakers will appear here.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {voiceTranscripts.map((line) => (
                  <div key={line.id} className="text-xs leading-relaxed">
                    <span
                      className={`font-semibold mr-2 ${
                        line.speaker === 'You' ? 'text-[#00D5FF]' : 'text-[#F5D58A]'
                      }`}
                    >
                      {line.speaker}:
                    </span>
                    <span className="text-[#E8EDF5]">{line.text}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};
