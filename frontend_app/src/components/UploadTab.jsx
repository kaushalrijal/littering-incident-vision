import React, { useState, useRef } from 'react';
import { Camera, Plus } from 'lucide-react';

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
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      setUploading(false);
      if (xhr.status === 201 || xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        setFile(null);
        if (onUploadSuccess) onUploadSuccess(data);
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
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-[26px] font-semibold text-[#26312B] tracking-tight">Upload Video</h2>
        <p className="text-[14px] text-[#647067] mt-1.5">
          Add CCTV, webcam or public-space footage for litter detection.
        </p>
      </div>

      <div className="lg-card overflow-hidden">
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`px-6 py-10 sm:py-12 text-center transition-colors duration-150 ${
            isDragging ? 'bg-[#EAF2EC]' : 'bg-white'
          }`}
          style={{
            backgroundImage: isDragging
              ? undefined
              : `linear-gradient(rgba(31,77,58,0.025) 1px, transparent 1px),
                 linear-gradient(90deg, rgba(31,77,58,0.025) 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleFileSelect}
          />

          <div className="w-11 h-11 mx-auto mb-4 rounded-xl bg-[#EAF2EC] border border-[#E2E7E2] flex items-center justify-center text-[#1F4D3A]">
            <Camera className="w-5 h-5" strokeWidth={1.75} />
          </div>

          <p className="text-[15px] font-medium text-[#26312B]">Drop video here</p>
          <p className="text-[13px] text-[#8A948D] mt-1 mb-4">or</p>

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1F4D3A] hover:bg-[#183D2E] text-white text-[13px] font-medium transition-colors duration-150 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Choose video
          </button>

          <p className="text-[12px] text-[#8A948D] mt-5">
            MP4 · MOV · AVI · MKV · WEBM
          </p>
          <p className="text-[12px] text-[#8A948D] mt-0.5">Maximum 500 MB</p>
        </div>
      </div>

      {error && <p className="text-[13px] text-[#C94A4A]">{error}</p>}

      {file && (
        <div className="lg-card p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-[#26312B] truncate">{file.name}</p>
              <p className="text-[12px] text-[#8A948D] mt-0.5">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-[13px] text-[#647067] hover:text-[#26312B] transition-colors duration-150"
              >
                Remove
              </button>
            )}
          </div>

          {uploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[12px] text-[#647067]">
                <span>Uploading…</span>
                <span className="font-medium text-[#26312B]">{progress}%</span>
              </div>
              <div className="h-1.5 w-full bg-[#EEF1EC] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#3E7C59] transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {!uploading && (
            <button
              type="button"
              onClick={uploadFile}
              className="inline-flex items-center px-3.5 py-2 rounded-lg bg-[#1F4D3A] hover:bg-[#183D2E] text-white text-[13px] font-medium transition-colors duration-150"
            >
              Start detection
            </button>
          )}
        </div>
      )}
    </div>
  );
}
