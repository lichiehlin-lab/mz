/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Play, Pause, RefreshCw, Download, Facebook, MessageCircle } from 'lucide-react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Helper to convert raw PCM base64 to a WAV Blob URL
function createWavUrl(base64PCM: string, sampleRate = 24000): string {
  const binaryString = atob(base64PCM);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  const buffer = bytes.buffer;
  const wavBuffer = new ArrayBuffer(44 + buffer.byteLength);
  const view = new DataView(wavBuffer);
  
  const writeString = (v: DataView, offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      v.setUint8(offset + i, str.charCodeAt(i));
    }
  };
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + buffer.byteLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, buffer.byteLength, true);
  
  new Uint8Array(wavBuffer, 44).set(bytes);
  
  const blob = new Blob([wavBuffer], { type: 'audio/wav' });
  return URL.createObjectURL(blob);
}

export default function App() {
  const [name, setName] = useState('');
  const [wish, setWish] = useState('健康平安');
  const [customWish, setCustomWish] = useState('');
  const [amuletColor, setAmuletColor] = useState('red');
  
  // Flow status
  const [status, setStatus] = useState<'idle' | 'tossing' | 'bwaBweiResult' | 'loading' | 'success' | 'error'>('idle');
  const [bwaBweiResult, setBwaBweiResult] = useState<'聖筊' | '笑筊' | '陰筊' | null>(null);
  
  const [result, setResult] = useState<{ imageUrl: string; audioUrl: string; blessing: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const wishes = ['健康平安', '事業順利', '財源廣進', '感情和睦', '學業進步', '其他'];
  const colors = [
    { id: 'red', name: '經典紅', value: 'red', hex: '#ef4444' },
    { id: 'yellow', name: '神聖黃', value: 'yellow', hex: '#eab308' },
    { id: 'pink', name: '人緣粉', value: 'pink', hex: '#ec4899' },
    { id: 'purple', name: '智慧紫', value: 'purple', hex: '#a855f7' },
  ];

  const handleToss = () => {
    if (!name.trim()) {
      setErrorMsg('請輸入您的姓名');
      return;
    }
    const finalWish = wish === '其他' ? customWish : wish;
    if (!finalWish.trim()) {
      setErrorMsg('請輸入您的祈求事項');
      return;
    }
    
    setErrorMsg('');
    setStatus('tossing');
    setBwaBweiResult(null);

    // Simulate tossing animation delay
    setTimeout(() => {
      const rand = Math.random();
      let res: '聖筊' | '笑筊' | '陰筊';
      
      // 50% chance of success for better UX, 25% for the others
      if (rand < 0.5) res = '聖筊';
      else if (rand < 0.75) res = '笑筊';
      else res = '陰筊';
      
      setBwaBweiResult(res);
      setStatus('bwaBweiResult');

      if (res === '聖筊') {
        setTimeout(() => {
          handleGenerate();
        }, 2000);
      }
    }, 1500);
  };

  const handleGenerate = async () => {
    setStatus('loading');
    setErrorMsg('');
    setResult(null);
    const finalWish = wish === '其他' ? customWish : wish;

    try {
      // 1. Generate Blessing Text
      const textResponse = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `請以台灣天上聖母（媽祖）的口吻，給予信徒「${name}」一段關於「${finalWish}」的專屬祝福語。大約50字以內，語氣溫暖、慈悲、安定人心。請使用充滿台灣味的道地台灣國語口吻（可適度加入「保庇」、「平安順適」、「乖孫」等台灣在地習慣用語），讓語音念出來時有親切的台灣腔。`,
      });
      const blessing = textResponse.text || '願媽祖保佑您平安順心。';

      // 2. Generate Amulet Image
      const imageResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              text: `A traditional Taiwanese Mazu temple amulet (媽祖平安符), rectangular ${amuletColor} fabric with intricate gold embroidery, hanging on a red string. The amulet features ONLY a traditional Mazu (Goddess of the Sea) logo or icon in the center. ABSOLUTELY NO TEXT, NO CHINESE CHARACTERS, NO CALLIGRAPHY, NO WORDS. Glowing with a subtle divine golden light. High quality, photorealistic, cultural artifact, studio lighting, dark background.`,
            },
          ],
        },
      });
      
      let imageUrl = '';
      for (const part of imageResponse.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }

      if (!imageUrl) {
        throw new Error('無法生成平安符圖片');
      }

      // 3. Generate Audio Blessing (TTS)
      const audioResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-tts',
        contents: [{ parts: [{ text: blessing }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      let audioUrl = '';
      const base64Audio = audioResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        audioUrl = createWavUrl(base64Audio, 24000);
      }

      setResult({ imageUrl, audioUrl, blessing });
      setStatus('success');
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error.message || '生成過程中發生錯誤，請稍後再試。');
      setStatus('error');
    }
  };

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleDownload = () => {
    if (!result?.imageUrl) return;
    const a = document.createElement('a');
    a.href = result.imageUrl;
    a.download = `媽祖平安符_${name}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const shareUrl = 'https://mz-flax.vercel.app/';
  const shareText = `我剛向媽祖求了一個專屬的【${wish === '其他' ? customWish : wish}】數位平安符！快來求一個保平安：`;

  const shareToLine = () => {
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(shareText + shareUrl)}`, '_blank');
  };

  const shareToFB = () => {
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      const handleEnded = () => setIsPlaying(false);
      audio.addEventListener('ended', handleEnded);
      return () => audio.removeEventListener('ended', handleEnded);
    }
  }, [result]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#6b0f1a] via-[#8b1c29] to-[#3a050b] text-white font-sans selection:bg-yellow-500/30 overflow-x-hidden">
      {/* Header */}
      <header className="p-6 text-center border-b border-yellow-500/20 bg-black/20 backdrop-blur-sm">
        <h1 className="text-3xl md:text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-yellow-500 to-yellow-200 tracking-widest drop-shadow-lg">
          媽祖繞境 AI 隨身平安符
        </h1>
        <p className="mt-3 text-yellow-100/80 text-sm tracking-widest">專屬您的數位祈福與庇佑</p>
      </header>

      <main className="max-w-4xl mx-auto p-6 py-12">
        <AnimatePresence mode="wait">
          {(status === 'idle' || status === 'error') && (
            <motion.div 
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-md mx-auto bg-black/40 backdrop-blur-md p-8 rounded-2xl border border-yellow-500/30 shadow-2xl shadow-black/50"
            >
              <div className="space-y-6">
                <div>
                  <label className="block text-yellow-200 mb-2 text-sm tracking-wider">信徒姓名</label>
                  <input 
                    type="text" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="請輸入您的姓名"
                    className="w-full bg-black/30 border border-yellow-500/30 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-yellow-200 mb-2 text-sm tracking-wider">祈求事項</label>
                  <select 
                    value={wish}
                    onChange={(e) => setWish(e.target.value)}
                    className="w-full bg-black/30 border border-yellow-500/30 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all appearance-none"
                  >
                    {wishes.map(w => <option key={w} value={w} className="bg-[#6b0f1a]">{w}</option>)}
                  </select>
                </div>

                {wish === '其他' && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                    <input 
                      type="text" 
                      value={customWish}
                      onChange={(e) => setCustomWish(e.target.value)}
                      placeholder="請輸入您的具體祈求"
                      className="w-full bg-black/30 border border-yellow-500/30 rounded-lg px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-yellow-400 focus:ring-1 focus:ring-yellow-400 transition-all mt-4"
                    />
                  </motion.div>
                )}

                <div>
                  <label className="block text-yellow-200 mb-3 text-sm tracking-wider">平安符顏色</label>
                  <div className="flex gap-4 justify-center">
                    {colors.map(c => (
                      <button
                        key={c.id}
                        onClick={() => setAmuletColor(c.value)}
                        className={`w-12 h-12 rounded-full border-2 transition-all ${amuletColor === c.value ? 'border-yellow-400 scale-110 shadow-[0_0_15px_rgba(234,179,8,0.6)]' : 'border-transparent opacity-60 hover:opacity-100'}`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>

                {errorMsg && (
                  <p className="text-red-400 text-sm text-center bg-red-900/20 py-2 rounded">{errorMsg}</p>
                )}

                <button 
                  onClick={handleToss}
                  className="w-full bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-[#3a050b] font-bold text-lg py-4 rounded-lg shadow-[0_0_15px_rgba(234,179,8,0.4)] hover:shadow-[0_0_25px_rgba(234,179,8,0.6)] transition-all flex items-center justify-center gap-2 mt-4"
                >
                  <Sparkles className="w-5 h-5" />
                  擲筊請示
                </button>
              </div>
            </motion.div>
          )}

          {status === 'tossing' && (
            <motion.div 
              key="tossing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 space-y-12"
            >
              <motion.div 
                animate={{ 
                  rotate: [0, 180, 360, 540, 720], 
                  y: [0, -150, -50, -100, 0],
                  x: [0, 30, -20, 10, 0]
                }} 
                transition={{ duration: 1.5, ease: "easeInOut" }}
                className="flex gap-6"
              >
                {/* Left Moon Block */}
                <div className="w-12 h-24 bg-[#ef4444] rounded-t-full rounded-bl-full rounded-br-sm shadow-[inset_-4px_-4px_10px_rgba(0,0,0,0.3)] border border-red-800"></div>
                {/* Right Moon Block */}
                <div className="w-12 h-24 bg-[#ef4444] rounded-t-full rounded-br-full rounded-bl-sm shadow-[inset_4px_-4px_10px_rgba(0,0,0,0.3)] border border-red-800"></div>
              </motion.div>
              <p className="text-yellow-200 text-2xl tracking-widest animate-pulse font-serif">向媽祖擲筊請示中...</p>
            </motion.div>
          )}

          {status === 'bwaBweiResult' && bwaBweiResult && (
            <motion.div 
              key="bwaBweiResult"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 space-y-8 text-center"
            >
              <h2 className={`text-6xl font-bold tracking-widest drop-shadow-lg ${bwaBweiResult === '聖筊' ? 'text-red-500' : 'text-yellow-500'}`}>
                {bwaBweiResult}
              </h2>
              <p className="text-yellow-100 text-xl font-serif">
                {bwaBweiResult === '聖筊' && '媽祖允杯！正在為您加持製作專屬平安符...'}
                {bwaBweiResult === '笑筊' && '媽祖微微一笑，可能還在考慮，請重新誠心祈求。'}
                {bwaBweiResult === '陰筊' && '媽祖指示時機未到或心意未決，請重新誠心祈求。'}
              </p>
              
              {bwaBweiResult !== '聖筊' && (
                <button 
                  onClick={() => setStatus('idle')}
                  className="mt-8 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-[#3a050b] font-bold px-10 py-4 rounded-full shadow-[0_0_15px_rgba(234,179,8,0.4)] transition-all"
                >
                  再次擲筊
                </button>
              )}
            </motion.div>
          )}

          {status === 'loading' && (
            <motion.div 
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 space-y-8"
            >
              <div className="relative w-32 h-32 flex items-center justify-center">
                <div className="absolute inset-0 border-4 border-yellow-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-yellow-500 rounded-full border-t-transparent animate-spin"></div>
                <Sparkles className="w-10 h-10 text-yellow-400 animate-pulse" />
              </div>
              <p className="text-yellow-200 text-xl tracking-widest animate-pulse font-serif">神明加持中，為您量身打造平安符...</p>
            </motion.div>
          )}

          {status === 'success' && result && (
            <motion.div 
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-2xl mx-auto bg-black/40 backdrop-blur-md p-8 md:p-12 rounded-3xl border border-yellow-500/30 shadow-[0_0_50px_rgba(234,179,8,0.15)] text-center"
            >
              <h2 className="text-2xl md:text-3xl font-bold text-yellow-400 mb-8 tracking-widest">您的專屬平安符</h2>
              
              <div className="relative w-64 h-64 md:w-80 md:h-80 mx-auto mb-10">
                <div className="absolute inset-0 bg-yellow-500/20 blur-3xl rounded-full animate-pulse"></div>
                <img 
                  src={result.imageUrl} 
                  alt="媽祖平安符" 
                  className="relative w-full h-full object-cover rounded-2xl shadow-2xl border-2 border-yellow-500/50"
                  referrerPolicy="no-referrer"
                />
              </div>

              <div className="bg-[#3a050b]/80 border border-yellow-500/20 rounded-xl p-6 md:p-8 mb-8 relative shadow-inner">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#6b0f1a] px-6 py-1 text-yellow-400 text-sm tracking-widest border border-yellow-500/30 rounded-full shadow-md">
                  媽祖賜福
                </div>
                <p className="text-lg md:text-xl leading-relaxed text-yellow-50 font-serif mt-4">
                  {result.blessing}
                </p>
              </div>

              {result.audioUrl && (
                <div className="flex flex-col items-center gap-4 mb-8">
                  <audio ref={audioRef} src={result.audioUrl} className="hidden" />
                  <button 
                    onClick={toggleAudio}
                    className="flex items-center gap-3 bg-gradient-to-r from-yellow-600/20 to-yellow-500/20 hover:from-yellow-600/30 hover:to-yellow-500/30 border border-yellow-500/50 text-yellow-400 px-8 py-4 rounded-full transition-all shadow-lg hover:shadow-yellow-500/20"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                    <span className="tracking-widest font-medium">{isPlaying ? '暫停語音祝福' : '聆聽語音祝福'}</span>
                  </button>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap justify-center gap-4 mt-8 border-t border-yellow-500/20 pt-8">
                <button 
                  onClick={handleDownload} 
                  className="flex items-center gap-2 bg-yellow-600/20 hover:bg-yellow-600/40 border border-yellow-500/50 text-yellow-400 px-6 py-3 rounded-full transition-all"
                >
                  <Download className="w-4 h-4" /> 儲存桌布
                </button>
                <button 
                  onClick={shareToLine} 
                  className="flex items-center gap-2 bg-[#00B900]/20 hover:bg-[#00B900]/40 border border-[#00B900]/50 text-[#00B900] px-6 py-3 rounded-full transition-all"
                >
                  <MessageCircle className="w-4 h-4" /> LINE 分享
                </button>
                <button 
                  onClick={shareToFB} 
                  className="flex items-center gap-2 bg-[#1877F2]/20 hover:bg-[#1877F2]/40 border border-[#1877F2]/50 text-[#1877F2] px-6 py-3 rounded-full transition-all"
                >
                  <Facebook className="w-4 h-4" /> FB 分享
                </button>
              </div>

              <button 
                onClick={() => {
                  setStatus('idle');
                  setIsPlaying(false);
                  if (audioRef.current) audioRef.current.pause();
                }}
                className="mt-10 flex items-center justify-center gap-2 mx-auto text-yellow-500/60 hover:text-yellow-400 tracking-widest text-sm transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                重新祈求
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
