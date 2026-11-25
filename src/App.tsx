import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  FileText,
  Layers,
  RefreshCw,
  Sparkles,
  Trash2,
  UploadCloud,
  Zap,
} from 'lucide-react';

const LOADING_STEPS = [
  'Mengunggah video ke AI Engine...',
  'Menganalisis setiap adegan & pergerakan...',
  'Mendeteksi karakter, pakaian, dan objek...',
  'Menganalisis gerakan tubuh & gestur...',
  'Menganalisis ekspresi wajah & emosi...',
  'Mendeteksi dialog dan percakapan audio...',
  'Menganalisis suara latar & efek lingkungan...',
  'Mengidentifikasi pergerakan & sudut kamera...',
  'Menyusun urutan adegan berdasarkan timeline...',
  'Menyusun prompt detail akhir...',
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '-';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function copyToClipboard(text: string): void {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.top = '0';
  textArea.style.left = '0';
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  try {
    const successful = document.execCommand('copy');
    if (!successful && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  } catch (err) {
    console.error('Copy to clipboard failed:', err);
  }
  document.body.removeChild(textArea);
}

interface ToastState {
  visible: boolean;
  message: string;
  type: 'info' | 'success' | 'error';
}

export default function App() {
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [metaDuration, setMetaDuration] = useState<string>('-');
  const [metaResolution, setMetaResolution] = useState<string>('-');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [loadingStatusText, setLoadingStatusText] = useState<string>('Mengunggah video...');
  const [loadingProgress, setLoadingProgress] = useState<number>(0);

  const [showResults, setShowResults] = useState<boolean>(false);
  const [generatedMasterPrompt, setGeneratedMasterPrompt] = useState<string>('');
  const [generatedFullAnalysis, setGeneratedFullAnalysis] = useState<string>('');

  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: 'Notifikasi',
    type: 'info',
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resultSectionRef = useRef<HTMLElement | null>(null);
  const loadingIntervalRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const stopLoadingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      if (loadingIntervalRef.current) window.clearInterval(loadingIntervalRef.current);
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
      if (stopLoadingTimeoutRef.current) window.clearTimeout(stopLoadingTimeoutRef.current);
    };
  }, [videoUrl]);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    setToast({ visible: true, message, type });
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3500);
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('video/')) {
      showToast('Format video tidak didukung. Harap unggah file video.', 'error');
      return;
    }

    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }

    const nextUrl = URL.createObjectURL(file);
    setCurrentFile(file);
    setVideoUrl(nextUrl);
    setMetaDuration('-');
    setMetaResolution('-');
    setShowResults(false);
    showToast('Video berhasil diunggah!', 'success');
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleDragEnterOrOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleLoadedMetadata = () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    setMetaDuration(formatDuration(videoEl.duration));
    setMetaResolution(`${videoEl.videoWidth} x ${videoEl.videoHeight}`);
  };

  const removeVideo = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    if (loadingIntervalRef.current) {
      window.clearInterval(loadingIntervalRef.current);
      loadingIntervalRef.current = null;
    }
    setCurrentFile(null);
    setVideoUrl('');
    setMetaDuration('-');
    setMetaResolution('-');
    setShowResults(false);
    setIsLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startLoadingAnimation = () => {
    if (loadingIntervalRef.current) {
      window.clearInterval(loadingIntervalRef.current);
    }
    if (stopLoadingTimeoutRef.current) {
      window.clearTimeout(stopLoadingTimeoutRef.current);
    }

    setIsLoading(true);
    let stepIndex = 0;
    setLoadingStatusText(LOADING_STEPS[0]);
    setLoadingProgress(10);

    loadingIntervalRef.current = window.setInterval(() => {
      stepIndex++;
      if (stepIndex < LOADING_STEPS.length) {
        setLoadingStatusText(LOADING_STEPS[stepIndex]);
        setLoadingProgress(((stepIndex + 1) / LOADING_STEPS.length) * 90);
      }
    }, 2500);
  };

  const stopLoadingAnimation = () => {
    if (loadingIntervalRef.current) {
      window.clearInterval(loadingIntervalRef.current);
      loadingIntervalRef.current = null;
    }
    setLoadingProgress(100);
    stopLoadingTimeoutRef.current = window.setTimeout(() => {
      setIsLoading(false);
    }, 500);
  };

  const parseAndDisplayResult = (fullText: string) => {
    const cleanText = fullText.replace(/\*\*/g, '');

    let masterPrompt = '';
    let fullAnalysis = cleanText;

    if (cleanText.includes('=== MASTER PROMPT SIAP GENERATE ===')) {
      const parts = cleanText.split('=== MASTER PROMPT SIAP GENERATE ===');
      fullAnalysis = parts[0].replace('=== RINCIAN ANALISIS DETAIL ===', '').trim();
      masterPrompt = parts[1].trim();
    } else {
      masterPrompt = cleanText;
    }

    setGeneratedMasterPrompt(masterPrompt);
    setGeneratedFullAnalysis(fullAnalysis);
    setShowResults(true);

    window.setTimeout(() => {
      resultSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const startVideoAnalysis = async () => {
    if (!currentFile) {
      showToast('Silakan unggah video terlebih dahulu.', 'error');
      return;
    }

    startLoadingAnimation();

    try {
      const mimeType = currentFile.type || 'video/mp4';

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
        },
        body: currentFile,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || `HTTP error status: ${response.status}`);
      }

      const textOutput: string | undefined = data.text;
      if (!textOutput) {
        throw new Error('Gagal mengambil teks hasil analisis dari AI Gemini.');
      }

      parseAndDisplayResult(textOutput);
      stopLoadingAnimation();
      showToast('Analisis video berhasil dilakukan!', 'success');
    } catch (error: unknown) {
      stopLoadingAnimation();
      console.error('Gemini Analysis Error:', error);

      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('API key') || message.includes('GEMINI_API_KEY')) {
        showToast('API Key tidak valid atau belum terkonfigurasi di Settings > Secrets.', 'error');
      } else if (message.includes('audio') || message.includes('sound')) {
        showToast('Audio tidak berhasil dianalisis secara penuh. Prompt visual tetap dapat dibuat.', 'error');
      } else {
        showToast(`Koneksi AI sedang bermasalah atau file terlalu besar. (${message})`, 'error');
      }
    }
  };

  const copyMasterPrompt = () => {
    if (!generatedMasterPrompt) return;
    copyToClipboard(generatedMasterPrompt);
    showToast('Prompt berhasil disalin!');
  };

  const copyAllResults = () => {
    const combined = `=== RINCIAN HASIL ANALISIS VIDEO ===\n\n${generatedFullAnalysis}\n\n=== MASTER PROMPT SIAP GENERATE ===\n\n${generatedMasterPrompt}`;
    copyToClipboard(combined);
    showToast('Seluruh hasil analisis berhasil disalin!');
  };

  const downloadTXT = () => {
    const filename = `VIDEO_PROMPT_ANALYSIS_${Date.now()}.txt`;
    const content = `==================================================
VIDEO TO PROMPT AI - HASIL ANALISIS VIDEO LENGKAP
==================================================

=== MASTER PROMPT SIAP GENERATE ===
${generatedMasterPrompt}

==================================================
=== RINCIAN DETAIL ANALISIS (14 KATEGORI) ===
==================================================
${generatedFullAnalysis}
`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('File TXT berhasil diunduh!');
  };

  const reAnalyze = () => {
    if (currentFile) {
      startVideoAnalysis();
    } else {
      showToast('Tidak ada video untuk dianalisis ulang.', 'error');
    }
  };

  const deleteResults = () => {
    setShowResults(false);
    setGeneratedMasterPrompt('');
    setGeneratedFullAnalysis('');
    showToast('Hasil analisis telah dihapus.');
  };

  return (
    <>
      {/* Toast Notification — Responsive mobile full-width inset, desktop top-right */}
      <div
        id="toast"
        role="status"
        aria-live="polite"
        className={`fixed top-4 left-4 right-4 sm:left-auto sm:right-5 sm:max-w-sm z-50 transition-all duration-200 ease-out flex items-center gap-3 bg-[#0f172a]/95 border text-slate-100 px-4 py-3.5 rounded-2xl shadow-2xl backdrop-blur-md ${
          toast.type === 'error' ? 'border-red-500/60' : 'border-brand-500/50'
        } ${toast.visible ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0 pointer-events-none'}`}
      >
        {toast.type === 'error' ? (
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
        ) : (
          <CheckCircle className="w-5 h-5 text-brand-400 shrink-0" />
        )}
        <span id="toast-message" className="text-sm font-medium leading-snug break-words">
          {toast.message}
        </span>
      </div>

      {/* MAIN CONTAINER */}
      <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-8 sm:pt-10 sm:pb-12 flex-grow flex flex-col gap-6 sm:gap-8">
        {/* HEADER SECTION */}
        <header className="text-center flex flex-col items-center gap-3 sm:gap-4">
          <p className="text-xs font-medium tracking-wide text-slate-400">
            Created by <span className="text-brand-400 font-semibold">Faisal Adi Priatna</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl overflow-hidden border border-brand-400/40 shadow-lg shadow-brand-500/20 shrink-0 bg-slate-900">
              <img
                src="/assets/aistudio/1000012086_d999056e.jpg"
                alt="Faisal Adi Priatna"
                className="w-full h-full object-cover object-[50%_15%]"
              />
            </div>
            <h1 className="text-2xl sm:text-4xl md:text-[2.65rem] font-extrabold tracking-tight text-white text-balance leading-tight">
              Video to Prompt AI
            </h1>
          </div>

          <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto leading-relaxed px-1">
            Ubah video menjadi prompt detail secara otomatis. Analisis menyeluruh visual, audio, dialog, pergerakan
            kamera, dan urutan timeline.
          </p>
        </header>

        {/* CONTENT LAYOUT */}
        <main className="flex flex-col gap-6 sm:gap-8">
          {/* UPLOAD & PREVIEW SECTION */}
          <section className="surface-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-xl">
            {!currentFile && (
              <div
                id="upload-zone"
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                onDragEnter={handleDragEnterOrOver}
                onDragOver={handleDragEnterOrOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl sm:rounded-2xl px-4 py-10 sm:px-8 sm:py-14 text-center flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 group ${
                  isDragging
                    ? 'border-brand-400 bg-brand-500/10'
                    : 'border-slate-700/80 hover:border-brand-400/70 bg-slate-950/40 hover:bg-slate-900/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  id="video-input"
                  accept="video/mp4,video/mov,video/webm,video/quicktime,video/x-matroska"
                  className="hidden"
                  onChange={handleFileSelect}
                />

                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-brand-500/10 text-brand-400 flex items-center justify-center border border-brand-500/20 group-hover:bg-brand-600 group-hover:text-white transition-colors duration-200">
                  <UploadCloud className="w-7 h-7 sm:w-8 sm:h-8" />
                </div>

                <div className="space-y-1.5 max-w-md">
                  <h2 className="text-base sm:text-lg font-bold text-white group-hover:text-brand-400 transition-colors text-balance">
                    Ketuk untuk unggah atau seret video ke sini
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Unggah video untuk dianalisis detail visual, audio, dialog, dan pergerakan kameranya secara
                    akurat.
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-slate-400 font-mono tabular-nums pt-1">
                  <span>MP4</span>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span>MOV</span>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span>WEBM</span>
                  <span aria-hidden="true" className="text-slate-600">
                    ·
                  </span>
                  <span>Maks. 100MB</span>
                </div>
              </div>
            )}

            {/* PREVIEW CONTAINER */}
            {currentFile && (
              <div id="preview-container" className="flex flex-col gap-5 sm:gap-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-stretch">
                  {/* Video Player */}
                  <div className="lg:col-span-7 xl:col-span-8 rounded-xl sm:rounded-2xl overflow-hidden bg-black border border-slate-800/90 flex items-center justify-center">
                    <video
                      ref={videoRef}
                      id="video-preview"
                      src={videoUrl}
                      controls
                      playsInline
                      onLoadedMetadata={handleLoadedMetadata}
                      className="w-full h-auto max-h-[300px] sm:max-h-[400px] object-contain"
                    />
                  </div>

                  {/* Video Metadata Panel (flat inset, no nested heavy cards) */}
                  <div className="lg:col-span-5 xl:col-span-4 surface-inset rounded-xl sm:rounded-2xl p-4 sm:p-5 flex flex-col justify-between gap-4">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                        <h3 className="font-semibold text-white text-sm">Informasi Video</h3>
                        <button
                          type="button"
                          onClick={removeVideo}
                          className="min-h-[36px] px-3 py-1.5 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Hapus</span>
                        </button>
                      </div>

                      {/* Responsive Metadata Grid: clean 2-col on mobile, clean stacked rows on desktop */}
                      <dl className="grid grid-cols-2 lg:grid-cols-1 gap-x-4 gap-y-3 text-xs">
                        <div className="col-span-2 lg:col-span-1 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-0.5 lg:gap-3 lg:pb-2.5 lg:border-b lg:border-slate-800/60">
                          <dt className="text-slate-400 shrink-0">Nama File</dt>
                          <dd
                            id="meta-name"
                            className="text-slate-100 font-mono truncate lg:text-right"
                            title={currentFile.name}
                          >
                            {currentFile.name}
                          </dd>
                        </div>

                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-0.5 lg:gap-3 lg:pb-2.5 lg:border-b lg:border-slate-800/60">
                          <dt className="text-slate-400 shrink-0">Ukuran</dt>
                          <dd id="meta-size" className="text-slate-100 font-mono tabular-nums">
                            {formatBytes(currentFile.size)}
                          </dd>
                        </div>

                        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-0.5 lg:gap-3 lg:pb-2.5 lg:border-b lg:border-slate-800/60">
                          <dt className="text-slate-400 shrink-0">Durasi</dt>
                          <dd id="meta-duration" className="text-slate-100 font-mono tabular-nums">
                            {metaDuration}
                          </dd>
                        </div>

                        <div className="col-span-2 lg:col-span-1 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-0.5 lg:gap-3">
                          <dt className="text-slate-400 shrink-0">Resolusi</dt>
                          <dd id="meta-resolution" className="text-slate-100 font-mono tabular-nums">
                            {metaResolution}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 text-xs text-slate-400 leading-relaxed">
                      <span className="text-brand-400 font-semibold">Siap diproses</span>
                      <span aria-hidden="true" className="mx-1.5 text-slate-600">
                        ·
                      </span>
                      <span>Visual frame &amp; trek audio akan dianalisis serentak.</span>
                    </div>
                  </div>
                </div>

                {/* GENERATE BUTTON */}
                <button
                  type="button"
                  id="btn-generate"
                  disabled={isLoading}
                  onClick={startVideoAnalysis}
                  className="w-full min-h-[52px] px-6 py-3.5 bg-brand-600 hover:bg-brand-500 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm sm:text-base rounded-xl sm:rounded-2xl shadow-lg shadow-brand-600/25 transition-all duration-150 flex items-center justify-center gap-2.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070b14]"
                >
                  <Sparkles className="w-5 h-5 shrink-0" />
                  <span className="whitespace-nowrap">Generate Prompt</span>
                </button>
              </div>
            )}
          </section>

          {/* PROGRESS & LOADING SECTION */}
          {isLoading && (
            <section
              id="loading-section"
              aria-live="polite"
              className="surface-panel rounded-2xl sm:rounded-3xl p-6 sm:p-10 text-center flex flex-col items-center gap-5"
            >
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-[3px] border-slate-800"></div>
                <div className="absolute inset-0 rounded-full border-[3px] border-brand-400 border-t-transparent animate-spin"></div>
                <Cpu className="w-7 h-7 sm:w-8 sm:h-8 text-brand-400" />
              </div>

              <div className="space-y-1.5 max-w-md">
                <h2 className="text-base sm:text-lg font-bold text-white">Menganalisis Video dengan AI</h2>
                <p id="loading-status-text" className="text-brand-400 font-medium text-xs sm:text-sm font-mono">
                  {loadingStatusText}
                </p>
              </div>

              <div className="w-full max-w-md space-y-2">
                <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                  <div
                    id="loading-bar"
                    className="bg-gradient-to-r from-brand-500 to-sky-400 h-full transition-all duration-500"
                    style={{ width: `${loadingProgress}%` }}
                  ></div>
                </div>
                <p className="text-xs font-mono tabular-nums text-slate-400">{Math.round(loadingProgress)}%</p>
              </div>
            </section>
          )}

          {/* RESULT SECTION */}
          {showResults && (
            <section ref={resultSectionRef} id="result-section" className="flex flex-col gap-5 sm:gap-6">
              {/* Top Result Bar — Clean 2-col uniform button grid on mobile, inline flex on desktop */}
              <div className="surface-panel rounded-2xl sm:rounded-3xl p-4 sm:p-6 flex flex-col gap-4 sm:gap-5">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-800/80">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-bold text-white text-base sm:text-lg leading-snug">Hasil Prompt Video</h2>
                      <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                        Analisis selesai. Prompt siap digunakan untuk AI Video Generator.
                      </p>
                    </div>
                  </div>

                  {/* Mobile-first uniform 2x2 action grid; clean row on md+ */}
                  <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 w-full lg:w-auto">
                    <button
                      type="button"
                      onClick={copyMasterPrompt}
                      className="col-span-2 sm:col-span-1 min-h-[44px] px-4 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                    >
                      <Copy className="w-4 h-4 shrink-0" />
                      <span>Salin Master Prompt</span>
                    </button>
                    <button
                      type="button"
                      onClick={copyAllResults}
                      className="min-h-[44px] px-3.5 py-2.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                      <FileText className="w-4 h-4 shrink-0" />
                      <span>Salin Semua</span>
                    </button>
                    <button
                      type="button"
                      onClick={downloadTXT}
                      className="min-h-[44px] px-3.5 py-2.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                      <Download className="w-4 h-4 shrink-0" />
                      <span>Unduh TXT</span>
                    </button>
                    <button
                      type="button"
                      onClick={reAnalyze}
                      className="col-span-2 sm:col-span-1 min-h-[44px] px-3.5 py-2.5 bg-slate-800/90 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                      <RefreshCw className="w-4 h-4 shrink-0" />
                      <span>Analisis Ulang</span>
                    </button>
                  </div>
                </div>

                {/* MASTER PROMPT BLOCK */}
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Zap className="w-4 h-4 text-brand-400 shrink-0" />
                      <h3 className="font-bold text-white text-sm sm:text-base">Master Prompt Siap Generate</h3>
                    </div>
                    <button
                      type="button"
                      onClick={copyMasterPrompt}
                      className="min-h-[36px] px-3 py-1.5 bg-brand-600/15 hover:bg-brand-600/25 text-brand-400 border border-brand-500/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                      title="Salin Master Prompt"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin</span>
                    </button>
                  </div>

                  <textarea
                    id="master-prompt-text"
                    readOnly
                    value={generatedMasterPrompt}
                    className="w-full h-60 sm:h-72 surface-inset rounded-xl sm:rounded-2xl p-4 text-slate-100 font-mono text-[13px] sm:text-sm leading-relaxed focus:outline-none focus:border-brand-500/60 resize-y selection:bg-brand-600 selection:text-white"
                    placeholder="Master prompt akan muncul di sini..."
                  />
                </div>

                {/* DIVIDER */}
                <div className="border-t border-slate-800/80" />

                {/* FULL DETAILED ANALYSIS BREAKDOWN */}
                <div className="flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-brand-400 shrink-0" />
                      <h3 className="text-sm sm:text-base font-bold text-white">Rincian Detail Hasil Analisis</h3>
                    </div>
                    <span className="text-xs text-slate-400 font-mono tabular-nums">14 kategori teridentifikasi</span>
                  </div>

                  <textarea
                    id="full-analysis-text"
                    readOnly
                    value={generatedFullAnalysis}
                    className="w-full h-[400px] sm:h-[560px] surface-inset rounded-xl sm:rounded-2xl p-4 sm:p-5 text-slate-200 font-mono text-[13px] sm:text-sm leading-relaxed focus:outline-none focus:border-brand-500/60 resize-y selection:bg-brand-600 selection:text-white"
                    placeholder="Rincian lengkap analisis akan ditampilkan di sini..."
                  />
                </div>

                {/* BOTTOM ACTIONS — Clean responsive stack on mobile */}
                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-4 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={deleteResults}
                    className="min-h-[44px] px-3 text-slate-400 hover:text-red-400 text-xs font-medium inline-flex items-center justify-center sm:justify-start gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    <span>Hapus Hasil Analisis</span>
                  </button>

                  <div className="grid grid-cols-1 sm:flex items-center gap-2.5 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={copyAllResults}
                      className="min-h-[44px] px-4 py-2.5 bg-slate-800/90 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Copy className="w-4 h-4 shrink-0" />
                      <span>Salin Semua Rincian</span>
                    </button>
                    <button
                      type="button"
                      onClick={copyMasterPrompt}
                      className="min-h-[44px] px-5 py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Sparkles className="w-4 h-4 shrink-0" />
                      <span>Salin Master Prompt</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}
        </main>

        {/* FOOTER */}
        <footer className="mt-auto text-center pt-6 border-t border-slate-800/70 text-xs text-slate-500 space-y-1.5">
          <p>© 2026 Video to Prompt AI. Professional Video Prompt Generation Engine.</p>
          <p className="text-slate-600">
            Preserving absolute video details, character consistency, dialogs, and timing accuracy.
          </p>
        </footer>
      </div>
    </>
  );
}
