// Componente para capturar el WorkoutShareCard como JPG
// y ofrecer botones para guardar y compartir

import { useState } from 'react';
import html2canvas from 'html2canvas';
import { Download, Share2, X, Image } from 'lucide-react';

interface WorkoutShareProps {
  cardRef: React.RefObject<HTMLDivElement | null>;
  workoutName: string;
}

export default function WorkoutShare({ cardRef, workoutName }: WorkoutShareProps) {
  const [captured, setCaptured] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const captureAsJpg = async (): Promise<string | null> => {
    if (!cardRef.current) return null;
    setCapturing(true);
    setError(null);
    try {
      const canvas = await html2canvas(cardRef.current, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#0f0f0f',
        scale: 2, // retina quality
        logging: false,
      });
      return canvas.toDataURL('image/jpeg', 0.92);
    } catch {
      setError('No se pudo capturar la imagen');
      return null;
    } finally {
      setCapturing(false);
    }
  };

  const handleCapture = async () => {
    const jpg = await captureAsJpg();
    if (jpg) setCaptured(jpg);
  };

  const handleSave = async () => {
    if (!captured) {
      const jpg = await captureAsJpg();
      if (!jpg) return;
      setCaptured(jpg);
    }
    const link = document.createElement('a');
    link.href = captured!;
    link.download = `workout-${workoutName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.jpg`;
    link.click();
  };

  const handleShare = async () => {
    if (!captured) {
      const jpg = await captureAsJpg();
      if (!jpg) return;
      setCaptured(jpg);
    }

    // Convert data URL to Blob
    const byteString = atob(captured!.split(',')[1]);
    const mimeType = captured!.split(',')[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
    const blob = new Blob([ab], { type: mimeType });
    const file = new File([blob], `workout-${workoutName}.jpg`, { type: mimeType });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: `Workout: ${workoutName}`,
          text: `He completado un workout de ${workoutName} 💪`,
        });
        return;
      } catch (e: unknown) {
        if ((e as Error).name === 'AbortError') return; // Usuario canceló
      }
    }

    // Fallback: abrir en pestaña nueva para compartir desde ahí
    const win = window.open('', '_blank');
    if (win) {
      win.document.write(`<img src="${captured}" style="max-width:100%" /><p>Mantén pulsado la imagen para guardarla o compartirla</p>`);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Botón de capturar / previsualizar */}
      {!captured ? (
        <button
          onClick={handleCapture}
          disabled={capturing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
          style={{
            backgroundColor: 'var(--color-surface-2)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
          }}
        >
          {capturing ? (
            <>Generando...</>
          ) : (
            <>
              <Image size={14} />
              Generar imagen del workout
            </>
          )}
        </button>
      ) : (
        <>
          {/* Previsualización en miniatura */}
          <div className="relative">
            <img
              src={captured}
              alt="Vista previa"
              className="w-full rounded-lg"
              style={{ border: '1px solid var(--color-border)' }}
            />
            <button
              onClick={() => setCaptured(null)}
              className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)' }}
            >
              <X size={12} />
            </button>
          </div>

          {/* Dos botones: guardar y compartir */}
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text)', border: '1px solid var(--color-border)' }}
            >
              <Download size={14} />
              Guardar
            </button>
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--color-primary)', color: '#000' }}
            >
              <Share2 size={14} />
              Compartir
            </button>
          </div>
        </>
      )}

      {error && (
        <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
      )}
    </div>
  );
}
