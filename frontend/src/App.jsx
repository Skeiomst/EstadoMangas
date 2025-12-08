import React, { useState, useEffect, useRef } from 'react';
import { Trash2, RotateCcw, Plus, FileText, ExternalLink, AlertTriangle, ImageOff } from 'lucide-react';
import './App.css';
import dayjs from 'dayjs';

const API_URL = "http://localhost:8000/api/scrape-manga";

function App() {
  // --- Estados Globales ---
  const [targetScan, setTargetScan] = useState("Seleccionar uno");
  const [inputUrls, setInputUrls] = useState([""]);
  const [results, setResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef(null);
  const isScanSelected = targetScan !== "Seleccionar uno";

  // --- Inicialización ---
  useEffect(() => {
    const savedUrls = JSON.parse(localStorage.getItem('mangaUrls') || '[]');
    if (savedUrls.length > 0) setInputUrls(savedUrls);
  }, []);

  // --- Lógica de Entradas de URL ---
  const handleUrlChange = (index, value) => {
    const newUrls = [...inputUrls];
    newUrls[index] = value;
    setInputUrls(newUrls);
  };

  const addUrlField = () => setInputUrls([...inputUrls, ""]);

  const removeUrlField = (index) => {
    const newUrls = inputUrls.filter((_, i) => i !== index);
    setInputUrls(newUrls.length ? newUrls : [""]);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split(/\r?\n/);
      const validUrls = lines
        .map(l => l.trim())
        .filter(l => l.startsWith('http'))
        .filter((value, index, self) => self.indexOf(value) === index);

      setInputUrls(validUrls.length > 0 ? validUrls : [""]);
    };
    reader.readAsText(file);
  };

  // --- Core: Procesamiento ---

  const processUrl = async (url) => {
    setResults(prev => prev.map(r => r.url === url ? { ...r, loading: true, error: null } : r));

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Error en servidor");
      }

      const data = await response.json();
      setResults(prev => prev.map(r => r.url === url ? { ...r, loading: false, data: data } : r));

    } catch (err) {
      setResults(prev => prev.map(r => r.url === url ? { ...r, loading: false, error: err.message } : r));
    } finally {
      setProgress(prev => ({ ...prev, current: prev.current + 1 }));
    }
  };

  const handleSearch = async () => {
    const cleanList = inputUrls.filter(u => u.trim() !== "");
    if (cleanList.length === 0 || !isScanSelected) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: cleanList.length });

    localStorage.setItem('mangaUrls', JSON.stringify(cleanList));

    const initialResults = cleanList.map(url => ({
      url,
      loading: true,
      error: null,
      data: null
    }));
    setResults(initialResults);

    const BATCH_SIZE = 3;
    for (let i = 0; i < cleanList.length; i += BATCH_SIZE) {
      const batch = cleanList.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(url => processUrl(url)));
    }

    setIsProcessing(false);
  };

  const handleRetryAllErrors = async () => {
    const errorItems = results.filter(r => r.error);
    if (errorItems.length === 0) return;

    setIsProcessing(true);
    setProgress({ current: 0, total: errorItems.length });

    const BATCH_SIZE = 3;
    for (let i = 0; i < errorItems.length; i += BATCH_SIZE) {
      const batch = errorItems.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(item => processUrl(item.url)));
    }

    setIsProcessing(false);
  };

  const handleRetryOne = (url) => {
    processUrl(url);
  };

  const handleClear = () => {
    setResults([]);
    setIsProcessing(false);
    setProgress({ current: 0, total: 0 });
  };

  // --- Lógica Visual (Semáforo) ---
  const getStatusColor = (itemData) => {
    if (!itemData || !itemData.opciones || itemData.opciones.length === 0) return 'bg-gray-400';

    const latestUpload = itemData.opciones[0];
    const today = dayjs();

    let uploadDate = dayjs(latestUpload.fecha);
    if (!uploadDate.isValid()) {
      uploadDate = today;
    }

    const diffDays = today.diff(uploadDate, 'day');

    const isTargetScan = latestUpload.grupo.toLowerCase().includes(targetScan.toLowerCase()) || targetScan === "Seleccionar uno";

    if (diffDays >= 90 || (!isTargetScan && targetScan !== "Seleccionar uno")) {
      return 'bg-red-500';
    }
    if ((diffDays >= 80 && diffDays <= 89) || itemData.opciones.length > 1) {
      return 'bg-yellow-400';
    }
    return 'bg-green-500';
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-[#E0E1DD] p-4 md:p-8 font-sans flex flex-col md:flex-row gap-8 md:items-start">

      {/* --- SECCIÓN IZQUIERDA: RESULTADOS --- */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        <div className='flex justify-between items-end'>
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-gray-800">Estado de Mangas</h1>
            <p className="text-gray-500">Monitor de actualizaciones TMO</p>
          </div>
          {isProcessing && (
            <div className="text-sm font-medium text-blue-600 animate-pulse">
              Procesando {progress.current} / {progress.total}
            </div>
          )}
        </div>

        {/* Botonera */}
        <div className="flex gap-2 mb-2 flex-wrap">
          {results.some(r => r.error) && !isProcessing && (
            <button onClick={handleRetryAllErrors} className="cursor-pointer bg-yellow-100 text-yellow-700 px-4 py-2 rounded-lg font-medium hover:bg-yellow-200 transition text-sm">
              Reintentar Errores
            </button>
          )}
          <button
            onClick={handleSearch}
            disabled={isProcessing || results.length > 0 || !isScanSelected}
            className={`flex-1 px-4 py-2 rounded-lg font-medium text-white transition shadow-sm flex items-center justify-center gap-2
              ${(isProcessing || results.length > 0 || !isScanSelected)
                ? 'bg-gray-400 cursor-not-allowed'
                : 'cursor-pointer bg-blue-600 hover:bg-blue-700'}
            `}
            title={!isScanSelected ? "Selecciona un Scan primero" : "Buscar mangas"}
          >
            {isProcessing ? 'Procesando...' : 'Buscar'}
          </button>
          <button onClick={handleClear} disabled={isProcessing} className="cursor-pointer bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 transition shadow-sm disabled:opacity-50">
            Limpiar
          </button>
        </div>

        {/* Lista de Resultados */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1">
          {results.length === 0 ? (
            <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-3">
              <FileText size={48} className="opacity-20" />
              <p>Agrega enlaces a la derecha y presiona Buscar</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {results.map((res, idx) => (
                <div key={idx} className="p-4 hover:bg-gray-50 transition-colors">

                  {/* Caso: Cargando */}
                  {res.loading && (
                    <div className="flex gap-4 animate-pulse">
                      <div className="w-20 h-28 bg-gray-200 rounded"></div>
                      <div className="flex-1 space-y-3 py-2">
                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                      </div>
                    </div>
                  )}

                  {/* Caso: Error */}
                  {!res.loading && res.error && (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-red-600 font-medium text-sm">
                        <AlertTriangle size={16} /> Error: {res.error.includes("interno") ? "Error Interno" : res.error}
                      </div>
                      <div className="flex justify-between items-center">
                        <a href={res.url} target="_blank" rel="noreferrer" className="text-gray-400 text-xs underline truncate max-w-[200px]">{res.url}</a>
                        <button onClick={() => handleRetryOne(res.url)} className="cursor-pointer text-xs border border-red-200 text-red-600 px-2 py-1 rounded hover:bg-red-50">
                          Reintentar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Caso: Éxito */}
                  {!res.loading && res.data && (
                    <div className="flex flex-col md:flex-row gap-4">
                      {/* Info Principal */}
                      <div className="flex-1 flex gap-4 min-w-0">
                        <div className="relative w-20 h-28 flex-shrink-0 bg-gray-200 rounded overflow-hidden shadow-sm">
                          <img
                            src={res.data.imagen || ""}
                            alt="Cover"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.src = "https://placehold.co/100x150?text=No+Img";
                              e.target.className = "w-full h-full object-cover opacity-50";
                            }}
                          />
                        </div>

                        <div className="flex flex-col gap-1 w-full overflow-hidden justify-center">
                          <h3 className="font-bold text-gray-800 leading-tight truncate" title={res.data.titulo}>
                            {res.data.titulo}
                          </h3>

                          <div className="flex items-center gap-2 mt-1">
                            <div className={`h-3 w-3 rounded-full ${getStatusColor(res.data)} shadow-sm`}
                              title="Estado del manga"></div>
                            <span className="text-xs text-gray-500">Estado</span>

                            <div className="flex items-center justify-center gap-2 ml-2">
                              <button
                                onClick={() => handleRetryOne(res.data.url)}
                                className="flex items-center gap-2 p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition cursor-pointer"
                                title="Volver a analizar este manga"
                              >
                                <RotateCcw size={14} />
                                <span className="text-xs text-gray-500">Volver a procesar</span>
                              </button>
                            </div>

                          </div>

                          <a href={res.data.url} target="_blank" rel="noreferrer" className="mt-2 text-blue-500 text-xs flex items-center gap-1 hover:underline w-fit">
                            Ver en TMO <ExternalLink size={10} />
                          </a>
                        </div>
                      </div>

                      {/* Detalles Caps */}
                      <div className="flex-1 border-t md:border-t-0 md:border-l border-gray-100 pt-3 md:pt-0 md:pl-4 flex flex-col justify-center">
                        <div className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">
                          Último: {res.data.ultimo_capitulo}
                        </div>

                        <div className="space-y-2 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                          {res.data.opciones.map((op, opIdx) => (
                            <div key={opIdx} className="bg-gray-100 p-2 rounded text-xs flex justify-between items-center group hover:bg-gray-200 transition">
                              <span className="font-medium text-gray-700 truncate mr-2" title={op.grupo}>{op.grupo}</span>
                              <span className="text-gray-500 whitespace-nowrap bg-white px-1 rounded shadow-sm">{op.fecha}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* --- SECCIÓN DERECHA: CONTROLES --- */}
      <div className="w-full md:w-80 flex flex-col gap-6 flex-shrink-0">

        {/* Card: Configuración */}
        <div className="bg-[#0D1B2A] p-5 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-4xl font-bold text-white mb-4 flex items-center gap-2">
            Scan
          </h2>
          <div className='space-y-4'>
            <div>
              <label className="text-xs font-bold text-white uppercase tracking-wide block mb-2">Scan Preferido</label>
              <select
                value={targetScan}
                onChange={(e) => setTargetScan(e.target.value)}
                disabled={isProcessing || results.length > 0}
                className={`cursor-pointer disabled:cursor-not-allowed w-full p-2.5 rounded-lg border text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition disabled:opacity-50
                  ${!isScanSelected ? 'border-red-400 ring-2 ring-red-400/50 bg-red-100' : 'border-gray-300 bg-white'}
                `}
              >
                <option>Seleccionar uno</option>
                <option value="Bokugen Translation">Bokugen Translation</option>
              </select>
            </div>
          </div>
        </div>

        {/* Card: Lista de URLs */}
        <div className="bg-[#0D1B2A] p-5 rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col min-h-[400px]">
          <h2 className="text-lg font-bold text-white mb-2">Lista de Mangas</h2>

          <div className="relative mb-4">
            <input
              type="file"
              accept=".txt"
              ref={fileInputRef}
              onChange={handleFileUpload}
              disabled={isProcessing || results.length > 0}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current.click()}
              disabled={isProcessing || results.length > 0}
              className="cursor-pointer disabled:cursor-not-allowed w-full flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm py-2 px-4 rounded-lg transition disabled:opacity-50 border border-gray-200 border-dashed"
            >
              <FileText size={16} /> Cargar desde .txt
            </button>
          </div>

          <div className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-[500px] pr-1 custom-scrollbar">
            {inputUrls.map((url, idx) => (
              <div key={idx} className="flex gap-1 group">
                <UrlInput
                  value={url}
                  onChange={(val) => handleUrlChange(idx, val)}
                  disabled={isProcessing || results.length > 0}
                />
                <button
                  onClick={() => removeUrlField(idx)}
                  disabled={isProcessing || results.length > 0}
                  className="cursor-pointer disabled:cursor-not-allowed text-gray-300 hover:text-red-500 px-1 disabled:opacity-0 transition"
                  title="Eliminar"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            onClick={addUrlField}
            disabled={isProcessing || results.length > 0}
            className="cursor-pointer disabled:cursor-not-allowed mt-4 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-white py-2 px-4 rounded-lg transition text-sm disabled:opacity-50 shadow-md"
          >
            <Plus size={16} /> Agregar Fila
          </button>
        </div>

      </div>
    </div>
  );
}

const UrlInput = ({ value, onChange, disabled }) => {
  const [focused, setFocused] = useState(false);

  const getVisualValue = () => {
    if (!value) return "";
    try {
      if (!value.includes("http")) return value;
      const parts = value.split('/').filter(Boolean);
      return parts[parts.length - 1] || value;
    } catch {
      return value;
    }
  };

  return (
    <input
      type="text"
      value={focused ? value : getVisualValue()}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      disabled={disabled}
      placeholder="https://zonatmo.com/..."
      className="w-full bg-gray-50 border border-gray-200 rounded p-2 text-gray-700 text-sm focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition disabled:opacity-50"
    />
  );
};

export default App;