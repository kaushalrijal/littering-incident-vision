import { useState, useRef } from 'react';
import { FileVideo, AlertCircle } from 'lucide-react';

const MAX_MB = 500;
const VALID_EXTS = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'];

export default function UploadTab({ onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const validateAndSetFile = (selectedFile) => {
    setError(null);
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    if (!VALID_EXTS.includes(ext)) {
      setError(`Invalid file format (.${ext}). Supported: ${VALID_EXTS.join(', ').toUpperCase()}.`);
      return;
    }
    if (selectedFile.size > MAX_MB * 1024 * 1024) {
      setError(`File size exceeds the maximum limit of ${MAX_MB} MB.`);
      return;
    }
    setFile(selectedFile);
  };

  const uploadFile = () => {
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/videos', true);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status === 201 || xhr.status === 200) {
        setFile(null);
        onUploadSuccess?.();
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          setError(err.detail || 'Upload failed');
        } catch {
          setError(`Upload failed with status ${xhr.status}`);
        }
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setError('Network error during upload');
    };

    xhr.send(formData);
  };

  return (
    <div className="max-w-2xl">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            validateAndSetFile(e.dataTransfer.files[0]);
          }
        }}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`cursor-pointer border border-dashed p-14 text-center transition-colors ${
          isDragging
            ? 'border-foreground bg-muted'
            : 'border-border hover:border-foreground'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) validateAndSetFile(e.target.files[0]);
            e.target.value = '';
          }}
        />

        <p className="text-sm font-bold tracking-wide uppercase">
          Drop video here or click to browse
        </p>
        <p className="mt-2.5 text-sm text-muted-foreground">
          MP4, MOV, AVI, MKV or WEBM — up to {MAX_MB} MB.
        </p>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-3 border border-destructive p-4 text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
          <p className="text-xs leading-relaxed font-semibold">{error}</p>
        </div>
      )}

      {file && (
        <div className="panel mt-6">
          <div className="panel-header">
            <p className="text-xs font-bold tracking-[0.08em] uppercase">Selected file</p>
            {!uploading && (
              <button onClick={() => setFile(null)} className="btn btn-outline px-3 py-1.5">
                Remove
              </button>
            )}
          </div>

          <div className="space-y-5 p-5">
            <div className="flex items-start gap-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center border border-foreground">
                <FileVideo className="h-4 w-4" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">{file.name}</p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground uppercase">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>

            {uploading && (
              <div className="space-y-2">
                <div className="flex justify-between font-mono text-[11px] text-muted-foreground uppercase">
                  <span>Uploading to queue</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-2 w-full bg-muted">
                  <div
                    className="h-full bg-foreground transition-all duration-200"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {!uploading && (
              <button onClick={uploadFile} className="btn btn-solid w-full py-3">
                Start processing pipeline
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
