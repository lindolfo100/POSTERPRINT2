import { useState, useRef, useEffect, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import { Upload, FileImage, Settings2, Download, Printer, Info, History, Trash2, ChevronRight, X } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

type PaperSize = 'A4' | 'A3' | 'Letter';
type Orientation = 'portrait' | 'landscape';
type MarginMode = 'narrow' | 'standard' | 'wide' | 'custom';

interface Settings {
  paperSize: PaperSize;
  orientation: Orientation;
  targetWidthCm: number;
  overlapMm: number;
  marginMode: MarginMode;
  showCutMarks: boolean;
}

interface HistoryItem {
  id: number;
  filename: string;
  image_src: string;
  image_dim_w: number;
  image_dim_h: number;
  paper_size: PaperSize;
  orientation: Orientation;
  target_width_cm: number;
  overlap_mm: number;
  show_cut_marks: boolean;
  created_at: string;
}

const PAPER_DIMENSIONS = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  Letter: { w: 215.9, h: 279.4 },
};

export default function App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageDim, setImageDim] = useState<{ w: number; h: number } | null>(null);
  const [settings, setSettings] = useState<Settings>({
    paperSize: 'A4',
    orientation: 'portrait',
    targetWidthCm: 100,
    overlapMm: 15,
    marginMode: 'standard',
    showCutMarks: true,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSilhouette, setShowSilhouette] = useState(true);

  const [sizingMode, setSizingMode] = useState<'cm' | 'pages'>('cm');

  const pw = settings.orientation === 'portrait' ? PAPER_DIMENSIONS[settings.paperSize].w : PAPER_DIMENSIONS[settings.paperSize].h;
  const ph = settings.orientation === 'portrait' ? PAPER_DIMENSIONS[settings.paperSize].h : PAPER_DIMENSIONS[settings.paperSize].w;
  const tileW = pw - settings.overlapMm;
  const tileH = ph - settings.overlapMm;

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      const data = await res.json();
      setHistory(data);
    } catch (error) {
      console.error('Failed to fetch history:', error);
    }
  };

  const saveToHistory = async (filename: string, src: string, dim: { w: number, h: number }) => {
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename,
          image_src: src,
          image_dim_w: dim.w,
          image_dim_h: dim.h,
          paper_size: settings.paperSize,
          orientation: settings.orientation,
          target_width_cm: settings.targetWidthCm,
          overlap_mm: settings.overlapMm,
          show_cut_marks: settings.showCutMarks,
        }),
      });
      fetchHistory();
    } catch (error) {
      console.error('Failed to save to history:', error);
    }
  };

  const deleteHistoryItem = async (id: number) => {
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' });
      fetchHistory();
    } catch (error) {
      console.error('Failed to delete history item:', error);
    }
  };

  const loadFromHistory = (item: HistoryItem) => {
    setImageDim({ w: item.image_dim_w, h: item.image_dim_h });
    setImageSrc(item.image_src);
    setSettings({
      paperSize: item.paper_size as PaperSize,
      orientation: item.orientation as Orientation,
      targetWidthCm: item.target_width_cm,
      overlapMm: item.overlap_mm,
      marginMode: 'custom', // Default to custom when loading
      showCutMarks: !!item.show_cut_marks,
    });
    setShowHistory(false);
  };

  const onDrop = async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    if (file.type === 'application/pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better quality
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: context, viewport, canvas } as any).promise;
        const dataUrl = canvas.toDataURL('image/png');
        loadImage(dataUrl, file.name);
      } catch (err) {
        console.error('Error reading PDF:', err);
        alert('Erro ao ler o PDF. Tente enviar uma imagem.');
      }
    } else if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          loadImage(e.target.result as string, file.name);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const loadImage = (src: string, filename: string) => {
    const img = new Image();
    img.onload = () => {
      const dim = { w: img.width, h: img.height };
      setImageDim(dim);
      setImageSrc(src);
      saveToHistory(filename, src, dim);
    };
    img.src = src;
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
  } as any);

  const targetHeightCm = useMemo(() => {
    if (!imageDim) return 0;
    return (settings.targetWidthCm * imageDim.h) / imageDim.w;
  }, [settings.targetWidthCm, imageDim]);

  const gridInfo = useMemo(() => {
    if (!imageDim || settings.targetWidthCm <= 0) return null;

    const pw = settings.orientation === 'portrait' ? PAPER_DIMENSIONS[settings.paperSize].w : PAPER_DIMENSIONS[settings.paperSize].h;
    const ph = settings.orientation === 'portrait' ? PAPER_DIMENSIONS[settings.paperSize].h : PAPER_DIMENSIONS[settings.paperSize].w;

    const tileW = pw - settings.overlapMm;
    const tileH = ph - settings.overlapMm;

    const EPSILON = 0.0001;

    const targetW_mm = settings.targetWidthCm * 10;
    const targetH_mm = targetHeightCm * 10;

    const cols = Math.max(1, Math.ceil((targetW_mm - settings.overlapMm) / tileW - EPSILON));
    const rows = Math.max(1, Math.ceil((targetH_mm - settings.overlapMm) / tileH - EPSILON));

    return { pw, ph, tileW, tileH, cols, rows, targetW_mm, targetH_mm };
  }, [settings, imageDim, targetHeightCm]);

  const generatePDF = async () => {
    if (!imageSrc || !gridInfo) return;
    setIsGenerating(true);
    setPdfProgress(0);

    try {
      const { pw, ph, tileW, tileH, cols, rows, targetW_mm, targetH_mm } = gridInfo;
      
      const pdf = new jsPDF({
        orientation: settings.orientation,
        unit: 'mm',
        format: settings.paperSize.toLowerCase(),
      });

      const totalPages = cols * rows;
      let currentPage = 0;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (currentPage > 0) {
            pdf.addPage();
          }

          const xOffset = c * tileW;
          const yOffset = r * tileH;

          const format = imageSrc.substring(imageSrc.indexOf(':') + 1, imageSrc.indexOf(';')).split('/')[1].toUpperCase();
          const validFormat = ['JPEG', 'PNG', 'WEBP'].includes(format) ? format : 'JPEG';

          // Draw the image shifted by -xOffset, -yOffset
          // The image size is targetW_mm x targetH_mm
          // Using an alias ('poster-image') prevents jsPDF from embedding the image multiple times
          pdf.addImage(imageSrc, validFormat, -xOffset, -yOffset, targetW_mm, targetH_mm, 'poster-image', 'FAST');

          // Draw cut marks
          if (settings.showCutMarks) {
            pdf.setDrawColor(200, 200, 200);
            pdf.setLineDashPattern([2, 2], 0);
            pdf.setLineWidth(0.5);

            // Right overlap line (Glue guide for the next column)
            if (c < cols - 1) {
              pdf.setDrawColor(200, 200, 200);
              pdf.setLineDashPattern([2, 2], 0);
              pdf.line(tileW, 0, tileW, ph);
              
              // Add "GLUE" label in the margin
              pdf.setTextColor(180, 180, 180);
              pdf.setFontSize(6);
              for (let y = 20; y < ph; y += 40) {
                pdf.text('COLA', tileW + 2, y, { angle: -90 });
              }
            }
            
            // Bottom overlap line (Glue guide for the next row)
            if (r < rows - 1) {
              pdf.setDrawColor(200, 200, 200);
              pdf.setLineDashPattern([2, 2], 0);
              pdf.line(0, tileH, pw, tileH);

              // Add "GLUE" label in the margin
              pdf.setTextColor(180, 180, 180);
              pdf.setFontSize(6);
              for (let x = 20; x < pw; x += 40) {
                pdf.text('COLA', x, tileH + 5);
              }
            }
            
            // Add small text indicator for page position
            pdf.setTextColor(150, 150, 150);
            pdf.setFontSize(8);
            pdf.text(`Página: Col ${c + 1}, Linha ${r + 1}`, 5, 5);
          }

          currentPage++;
          setPdfProgress(Math.round((currentPage / totalPages) * 100));
          
          // Small delay to allow UI to update
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      pdf.save('poster-dividido.pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Erro ao gerar o PDF.');
    } finally {
      setIsGenerating(false);
      setPdfProgress(0);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans flex flex-col md:flex-row">
      {/* Sidebar */}
      <div className="w-full md:w-80 bg-white border-r border-neutral-200 p-6 flex flex-col gap-6 overflow-y-auto shrink-0 shadow-sm z-10">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 flex items-center gap-2">
            <Printer className="w-6 h-6 text-indigo-600" />
            PosterPrint
          </h1>
          <p className="text-sm text-neutral-500 mt-1">Divida imagens para impressão em tamanho real.</p>
        </div>

        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Configurações
          </h2>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Tamanho do Papel</label>
              <select
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                value={settings.paperSize}
                onChange={(e) => setSettings({ ...settings, paperSize: e.target.value as PaperSize })}
              >
                <option value="A4">A4 (210 x 297 mm)</option>
                <option value="A3">A3 (297 x 420 mm)</option>
                <option value="Letter">Carta (216 x 279 mm)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Orientação</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  className={`px-3 py-2 text-sm rounded-lg border ${settings.orientation === 'portrait' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium' : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}
                  onClick={() => setSettings({ ...settings, orientation: 'portrait' })}
                >
                  Retrato
                </button>
                <button
                  className={`px-3 py-2 text-sm rounded-lg border ${settings.orientation === 'landscape' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium' : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}
                  onClick={() => setSettings({ ...settings, orientation: 'landscape' })}
                >
                  Paisagem
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Definir tamanho por:
              </label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  className={`px-3 py-2 text-sm rounded-lg border ${sizingMode === 'cm' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium' : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}
                  onClick={() => setSizingMode('cm')}
                >
                  Medida (cm)
                </button>
                <button
                  className={`px-3 py-2 text-sm rounded-lg border ${sizingMode === 'pages' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium' : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}
                  onClick={() => setSizingMode('pages')}
                >
                  Páginas
                </button>
              </div>

              {sizingMode === 'cm' ? (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">
                    Largura Final (cm)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={settings.targetWidthCm}
                    onChange={(e) => setSettings({ ...settings, targetWidthCm: Number(e.target.value) || 0 })}
                  />
                  {imageDim && (
                    <p className="text-xs text-neutral-500 mt-1">
                      Altura proporcional: {targetHeightCm.toFixed(1)} cm
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {imageDim && (
                    <div>
                      <label className="block text-xs font-semibold text-neutral-500 uppercase mb-1">
                        Formatos Padrões
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: 'A3 (2xA4)', cols: settings.orientation === 'portrait' ? 1 : 2, rows: settings.orientation === 'portrait' ? 2 : 1 },
                          { label: 'A2 (4xA4)', cols: 2, rows: 2 },
                          { label: 'A1 (8xA4)', cols: settings.orientation === 'portrait' ? 2 : 4, rows: settings.orientation === 'portrait' ? 4 : 2 },
                          { label: 'A0 (16xA4)', cols: 4, rows: 4 },
                        ].map((format) => (
                          <button
                            key={format.label}
                            onClick={() => {
                              // We want to force the width so it matching the requested format format.cols / format.rows
                              // Since we preserve aspect ratio, setting cols is enough
                              const w_mm = format.cols * tileW + settings.overlapMm;
                              setSettings({ ...settings, targetWidthCm: w_mm / 10 });
                            }}
                            className="px-2 py-1 text-xs bg-white border border-neutral-300 rounded hover:bg-neutral-50 text-neutral-700"
                          >
                            {format.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Largura (páginas)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-neutral-50"
                        value={gridInfo ? gridInfo.cols : 1}
                        disabled={!imageDim}
                        onChange={(e) => {
                          const cols = Math.max(1, Number(e.target.value) || 1);
                          const w_mm = cols * tileW + settings.overlapMm;
                          setSettings({ ...settings, targetWidthCm: w_mm / 10 });
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Altura (páginas)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:bg-neutral-50"
                        value={gridInfo ? gridInfo.rows : 1}
                        disabled={!imageDim}
                        onChange={(e) => {
                          if (!imageDim) return;
                          const rows = Math.max(1, Number(e.target.value) || 1);
                          const h_mm = rows * tileH + settings.overlapMm;
                          const h_cm = h_mm / 10;
                          const w_cm = h_cm * (imageDim.w / imageDim.h);
                          setSettings({ ...settings, targetWidthCm: w_cm });
                        }}
                      />
                    </div>
                  </div>
                  {imageDim && (
                    <p className="text-xs text-neutral-500 col-span-2">
                      Tamanho final: {settings.targetWidthCm.toFixed(1)} x {targetHeightCm.toFixed(1)} cm
                    </p>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Margem de Colagem
              </label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {[
                  { id: 'narrow', label: 'Estreita', val: 10 },
                  { id: 'standard', label: 'Padrão', val: 15 },
                  { id: 'wide', label: 'Ampla', val: 20 },
                  { id: 'custom', label: 'Personalizada', val: settings.overlapMm },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    className={`px-2 py-1.5 text-xs rounded-lg border ${settings.marginMode === mode.id ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium' : 'bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50'}`}
                    onClick={() => setSettings({ 
                      ...settings, 
                      marginMode: mode.id as MarginMode, 
                      overlapMm: mode.id === 'custom' ? settings.overlapMm : mode.val 
                    })}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
              {settings.marginMode === 'custom' && (
                <input
                  type="number"
                  min="0"
                  max="50"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={settings.overlapMm}
                  onChange={(e) => setSettings({ ...settings, overlapMm: Number(e.target.value) || 0 })}
                />
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="showSilhouette"
                className="rounded text-indigo-600 focus:ring-indigo-500"
                checked={showSilhouette}
                onChange={(e) => setShowSilhouette(e.target.checked)}
              />
              <label htmlFor="showSilhouette" className="text-sm text-neutral-700">
                Mostrar silhueta de referência (1.6m)
              </label>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="cutMarks"
                className="rounded text-indigo-600 focus:ring-indigo-500"
                checked={settings.showCutMarks}
                onChange={(e) => setSettings({ ...settings, showCutMarks: e.target.checked })}
              />
              <label htmlFor="cutMarks" className="text-sm text-neutral-700">
                Mostrar linhas de corte/colagem
              </label>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-6 border-t border-neutral-200 flex flex-col gap-3">
          <button
            onClick={() => setShowHistory(true)}
            className="w-full bg-white hover:bg-neutral-50 text-neutral-700 font-medium py-2 px-4 rounded-xl border border-neutral-300 transition-colors flex items-center justify-center gap-2"
          >
            <History className="w-4 h-4" />
            Ver Histórico
          </button>

          {gridInfo && (
            <div className="bg-indigo-50 rounded-xl p-4 mb-4 border border-indigo-100">
              <h3 className="text-sm font-semibold text-indigo-900 mb-2 flex items-center gap-1">
                <Info className="w-4 h-4" /> Resumo
              </h3>
              <ul className="text-sm text-indigo-800 space-y-1">
                <li>Total de folhas: <strong>{gridInfo.cols * gridInfo.rows}</strong></li>
                <li>Grade: {gridInfo.cols} colunas × {gridInfo.rows} linhas</li>
                <li>Tamanho final: {settings.targetWidthCm} x {targetHeightCm.toFixed(1)} cm</li>
              </ul>
            </div>
          )}

          <button
            onClick={generatePDF}
            disabled={!imageSrc || isGenerating}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Gerando ({pdfProgress}%)
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Baixar PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-neutral-100 p-4 md:p-8 flex flex-col overflow-hidden">
        {!imageSrc ? (
          <div
            {...getRootProps()}
            className={`flex-1 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 transition-colors cursor-pointer ${
              isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-neutral-300 bg-white hover:bg-neutral-50'
            }`}
          >
            <input {...getInputProps()} />
            <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4">
              <Upload className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium text-neutral-900 mb-1">Arraste sua imagem ou PDF</h3>
            <p className="text-neutral-500 text-center max-w-sm">
              Suporta JPG, PNG, WEBP e PDF. A imagem será dividida em várias páginas para impressão.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-4 shrink-0">
              <h2 className="text-lg font-medium text-neutral-900">Pré-visualização</h2>
              <button
                onClick={() => {
                  setImageSrc(null);
                  setImageDim(null);
                }}
                className="text-sm text-neutral-500 hover:text-neutral-700"
              >
                Trocar imagem
              </button>
            </div>
            
            <div className="flex-1 bg-white rounded-2xl border border-neutral-200 overflow-auto p-4 flex items-end justify-center relative shadow-sm">
              {gridInfo && (
                <div className="flex items-end gap-8">
                  <div 
                    className="relative shadow-md shrink-0 transition-all duration-300"
                    style={{
                      height: `calc(70vh * (${targetHeightCm} / ${Math.max(160, targetHeightCm)}))`
                    }}
                  >
                    <img 
                      src={imageSrc} 
                      alt="Preview" 
                      className="w-full h-full object-contain block"
                      id="preview-image"
                    />
                    <GridOverlay gridInfo={gridInfo} />
                  </div>

                  {showSilhouette && (
                    <div 
                      className="flex flex-col items-center shrink-0 transition-all duration-300"
                      style={{
                        height: `calc(70vh * (160 / ${Math.max(160, targetHeightCm)}))`,
                        // If poster is taller than 160cm, we scale silhouette down relative to poster
                        // If poster is shorter than 160cm, we need to be careful with max-h
                      }}
                    >
                      <div 
                        className="relative flex flex-col items-center"
                        style={{
                          height: '100%',
                          aspectRatio: '1/3'
                        }}
                      >
                        {/* Simple Human Silhouette SVG */}
                        <svg viewBox="0 0 100 300" className="h-full text-neutral-300 fill-current">
                          <circle cx="50" cy="30" r="25" />
                          <path d="M20 70 h60 v100 l-15 120 h-10 l-5 -80 l-5 80 h-10 l-15 -120 z" />
                        </svg>
                        <div className="absolute -bottom-6 whitespace-nowrap text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                          Referência: 1.60m
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-neutral-200 flex justify-between items-center">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                Histórico de Uploads
              </h2>
              <button 
                onClick={() => setShowHistory(false)}
                className="p-2 hover:bg-neutral-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4">
              {history.length === 0 ? (
                <div className="text-center py-12 text-neutral-500">
                  Nenhum upload encontrado no histórico.
                </div>
              ) : (
                <div className="grid gap-4">
                  {history.map((item) => (
                    <div 
                      key={item.id} 
                      className="group bg-neutral-50 border border-neutral-200 rounded-xl p-3 flex items-center gap-4 hover:border-indigo-300 transition-all"
                    >
                      <div className="w-16 h-16 bg-neutral-200 rounded-lg overflow-hidden shrink-0">
                        <img src={item.image_src} alt="" className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-neutral-900 truncate">{item.filename}</h4>
                        <p className="text-xs text-neutral-500">
                          {new Date(item.created_at).toLocaleDateString()} • {item.target_width_cm}cm • {item.paper_size}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => loadFromHistory(item)}
                          className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                          title="Reprocessar"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteHistoryItem(item.id)}
                          className="p-2 bg-white text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function GridOverlay({ gridInfo }: { gridInfo: any }) {
  const { cols, rows, targetW_mm, targetH_mm, pw, ph, tileW, tileH } = gridInfo;

  return (
    <div 
      className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden"
    >
      {Array.from({ length: rows }).map((_, r) => (
        Array.from({ length: cols }).map((_, c) => {
          // Calculate percentages for positioning
          const leftPct = (c * tileW / targetW_mm) * 100;
          const topPct = (r * tileH / targetH_mm) * 100;
          const widthPct = (pw / targetW_mm) * 100;
          const heightPct = (ph / targetH_mm) * 100;
          
          return (
            <div
              key={`${r}-${c}`}
              className="absolute border border-indigo-500/50 bg-indigo-500/10 flex items-center justify-center"
              style={{
                left: `${leftPct}%`,
                top: `${topPct}%`,
                width: `${widthPct}%`,
                height: `${heightPct}%`,
              }}
            >
              <span className="text-white text-xs font-bold bg-indigo-900/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
                {c + 1},{r + 1}
              </span>
            </div>
          );
        })
      ))}
    </div>
  );
}
