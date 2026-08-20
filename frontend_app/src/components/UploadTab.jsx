import React, { useState, useRef } from 'react';
import { UploadCloud, FileVideo, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

export default function UploadTab({ onUploadSuccess }) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    setError(null);
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/webm'];
    const ext = selectedFile.name.split('.').pop().toLowerCase();
    const validExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'];

    if (!validExts.includes(ext)) {
      setError(`Invalid file format (.${ext}). Supported: MP4, MOV, AVI, MKV, WEBM.`);
      return;
    }

    if (selectedFile.size > 500 * 1024 * 1024) {
      setError('File size exceeds maximum limit of 500 MB.');
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
        const percentComplete = Math.round((e.loaded / e.total) * 100);
        setProgress(percentComplete);
      }
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status === 201 || xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        setFile(null);
        if (onUploadSuccess) {
          onUploadSuccess(data);
        }
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
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-100 tracking-tight">Upload Video</h2>
        <p className="text-xs text-slate-400 mt-1">
          Upload CCTV, webcam, or public space video footage to run real-time YOLOv8 + ByteTrack litter detection.
        </p>
      </div>

      {/* Upload Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-all ${
          isDragging
            ? 'border-cyan-400 bg-cyan-500/5'
            : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        <div className="space-y-4">
          <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 mx-auto flex items-center justify-center text-cyan-400">
            <UploadCloud className="w-6 h-6" />
          </div>

          <div>
            <p className="text-sm font-medium text-slate-200">
              Click to upload or drag & drop video clip
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Supports MP4, MOV, AVI, MKV, WEBM (Max 500 MB)
            </p>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Selected File Card & Actions */}
      {file && (
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-slate-900 border border-slate-800 flex items-center justify-center text-cyan-400">
                <FileVideo className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-200">{file.name}</p>
                <p className="text-[11px] text-slate-400">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </p>
              </div>
            </div>
            {!uploading && (
              <button
                onClick={() => setFile(null)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Remove
              </button>
            )}
          </div>

          {/* Upload Progress Bar */}
          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Uploading to processing queue...</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-400 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {!uploading && (
            <button
              onClick={uploadFile}
              className="w-full py-2.5 px-4 rounded-md bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium text-xs tracking-wide transition-colors flex items-center justify-center gap-2"
            >
              Start Litter Detection Pipeline
            </button>
          )}
        </div>
      )}
    </div>
  );
}
