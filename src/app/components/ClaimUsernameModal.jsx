"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import axios from "axios";
import ReactCrop, { centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { motion, AnimatePresence } from "framer-motion";
import Portal from "../Portal/Portal";
import {
  Camera,
  Loader2,
  X,
  Edit3,
  Trash2,
  RotateCcw,
  BadgeCheck,
} from "lucide-react";

// Validation rules: only letters, numbers, and underscores (no spaces, @, ^, ~, !, ?, etc.)
const validateUsernameFormat = (name) => {
  if (!name || name.trim().length === 0) {
    return { valid: false, reason: "Please enter or pick a username" };
  }
  if (name.length > 30) {
    return { valid: false, reason: "Username cannot exceed 30 characters" };
  }
  if (!/^[a-z0-9_]+$/.test(name)) {
    return {
      valid: false,
      reason: "Spaces and symbols (@, !, ?, ^, ~, etc.) are not allowed. Only letters, numbers, and underscores (_).",
    };
  }
  return { valid: true };
};

export default function ClaimUsernameModal({
  token,
  initialSuggestion = "",
  initialPhoto = null,
  onSuccess,
  onCancel,
}) {
  // Generate initial base handle from suggestion or fallback
  const baseSuggestion = useMemo(() => {
    const cleaned = (initialSuggestion || "")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .toLowerCase()
      .slice(0, 20);
    return cleaned || "user_wasla";
  }, [initialSuggestion]);

  // Quick recommendation chips for the user
  const recommendedHandles = useMemo(() => {
    return [
      baseSuggestion,
      `${baseSuggestion}_1`,
      `${baseSuggestion}_7`,
    ];
  }, [baseSuggestion]);

  const [username, setUsername] = useState(baseSuggestion);
  const [status, setStatus] = useState("idle"); // idle | checking | available | taken | invalid
  const [statusMsg, setStatusMsg] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Profile Picture state (identical to normal_UserProfile)
  const [photoPreview, setPhotoPreview] = useState(initialPhoto || null);
  const [photoBlob, setPhotoBlob] = useState(null);
  const [isViewingPhoto, setIsViewingPhoto] = useState(false);
  const [photoToCrop, setPhotoToCrop] = useState(null);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [rotation, setRotation] = useState(0);

  const fileInputRef = useRef(null);
  const imgRef = useRef(null);
  const checkTimer = useRef(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://worship-team-api.onrender.com/api";

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (photoPreview && photoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const checkAvailability = useCallback(async (name) => {
    const check = validateUsernameFormat(name);
    if (!check.valid) {
      setStatus("invalid");
      setStatusMsg(check.reason);
      return;
    }

    setStatus("checking");
    setStatusMsg("Checking availability...");

    try {
      const res = await axios.get(`${apiBase}/users/check-username?q=${encodeURIComponent(name)}`);
      if (res.data.available) {
        setStatus("available");
        setStatusMsg(`@${name} is available!`);
      } else {
        setStatus("taken");
        setStatusMsg(res.data.reason || `@${name} is already taken`);
      }
    } catch (err) {
      const msg = err.response?.data?.reason || err.response?.data?.msg || "Unavailable";
      setStatus("taken");
      setStatusMsg(msg);
    }
  }, [apiBase]);

  const handleInputChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/\s+/g, "");
    setUsername(val);

    if (checkTimer.current) clearTimeout(checkTimer.current);

    const check = validateUsernameFormat(val);
    if (!check.valid) {
      setStatus("invalid");
      setStatusMsg(check.reason);
      return;
    }

    checkTimer.current = setTimeout(() => {
      checkAvailability(val);
    }, 300);
  };

  const handlePickSuggestion = (handle) => {
    setUsername(handle);
    if (checkTimer.current) clearTimeout(checkTimer.current);
    checkAvailability(handle);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (username) {
        checkAvailability(username);
      }
    }, 50);

    return () => {
      clearTimeout(timer);
      if (checkTimer.current) clearTimeout(checkTimer.current);
    };
  }, [checkAvailability, username]);

  // Image Selection (identical to normal_UserProfile)
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert("File is too large (max 5MB)");
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", () => {
      setPhotoToCrop(reader.result);
      setRotation(0);
    });
    reader.readAsDataURL(file);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onImageLoad = (e) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      makeAspectCrop({ unit: "%", width: 85 }, 1, width, height),
      width,
      height
    );
    setCrop(initialCrop);
  };

  // Image Crop confirmation (identical to normal_UserProfile)
  const confirmCrop = () => {
    if (!photoToCrop || !completedCrop || !imgRef.current) return;

    try {
      const image = imgRef.current;
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (rotation % 360 !== 0) {
        // Handle rotation onto an intermediate canvas
        const rotCanvas = document.createElement("canvas");
        const rotCtx = rotCanvas.getContext("2d");
        const angle = (rotation * Math.PI) / 180;
        const is90or270 = rotation % 180 !== 0;

        rotCanvas.width = is90or270 ? image.naturalHeight : image.naturalWidth;
        rotCanvas.height = is90or270 ? image.naturalWidth : image.naturalHeight;

        rotCtx.translate(rotCanvas.width / 2, rotCanvas.height / 2);
        rotCtx.rotate(angle);
        rotCtx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

        const rotScaleX = rotCanvas.width / image.width;
        const rotScaleY = rotCanvas.height / image.height;

        canvas.width = completedCrop.width * rotScaleX;
        canvas.height = completedCrop.height * rotScaleY;

        ctx.drawImage(
          rotCanvas,
          completedCrop.x * rotScaleX,
          completedCrop.y * rotScaleY,
          completedCrop.width * rotScaleX,
          completedCrop.height * rotScaleY,
          0,
          0,
          canvas.width,
          canvas.height
        );
      } else {
        canvas.width = completedCrop.width * scaleX;
        canvas.height = completedCrop.height * scaleY;

        ctx.drawImage(
          image,
          completedCrop.x * scaleX,
          completedCrop.y * scaleY,
          completedCrop.width * scaleX,
          completedCrop.height * scaleY,
          0,
          0,
          canvas.width,
          canvas.height
        );
      }

      setPhotoToCrop(null);
      setRotation(0);

      const MAX_WIDTH = 500;
      const MAX_HEIGHT = 500;
      let width = canvas.width;
      let height = canvas.height;

      if (width > height && width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      } else if (height > MAX_HEIGHT) {
        width = Math.round((width * MAX_HEIGHT) / height);
        height = MAX_HEIGHT;
      }

      const scaleCanvas = document.createElement("canvas");
      scaleCanvas.width = width;
      scaleCanvas.height = height;
      const scaleCtx = scaleCanvas.getContext("2d");
      scaleCtx.drawImage(canvas, 0, 0, width, height);

      scaleCanvas.toBlob(
        (blob) => {
          if (!blob) {
            scaleCanvas.toBlob((fallbackBlob) => {
              if (fallbackBlob) {
                setPhotoBlob(fallbackBlob);
                if (photoPreview && photoPreview.startsWith("blob:")) {
                  URL.revokeObjectURL(photoPreview);
                }
                setPhotoPreview(URL.createObjectURL(fallbackBlob));
              }
            }, "image/jpeg", 0.85);
            return;
          }
          setPhotoBlob(blob);
          if (photoPreview && photoPreview.startsWith("blob:")) {
            URL.revokeObjectURL(photoPreview);
          }
          setPhotoPreview(URL.createObjectURL(blob));
        },
        "image/webp",
        0.85
      );
    } catch (err) {
      console.error("Crop error:", err);
      setPhotoToCrop(null);
    }
  };

  const handlePhotoRemove = () => {
    if (photoPreview && photoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoPreview(null);
    setPhotoBlob(null);
    setIsViewingPhoto(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (status !== "available" || isSubmitting) return;

    setIsSubmitting(true);

    const authToken = token || (typeof window !== "undefined" ? localStorage.getItem("user_Taspe7_Token") : "");
    let finalPhotoUrl = photoPreview && !photoPreview.startsWith("blob:") ? photoPreview : null;

    // 1. Upload photo if a newly cropped image blob exists
    if (photoBlob) {
      setIsUploadingPhoto(true);
      try {
        const fileExt = photoBlob.type.includes("jpeg") ? "jpg" : "webp";
        const urlRes = await axios.post(
          `${apiBase}/users/profile-photo/upload-url`,
          {
            fileSize: photoBlob.size,
            mimeType: photoBlob.type,
            fileExt,
          },
          {
            headers: { Authorization: `Bearer ${authToken}` },
          }
        );

        if (urlRes.data?.uploadUrl) {
          await axios.put(urlRes.data.uploadUrl, photoBlob, {
            headers: { "Content-Type": photoBlob.type },
          });
          finalPhotoUrl = urlRes.data.fileUrl;
        }
      } catch (uploadErr) {
        console.warn("Photo storage upload failed:", uploadErr);
      } finally {
        setIsUploadingPhoto(false);
      }
    }

    // 2. Persist username and profilePhoto to backend
    try {
      const res = await axios.post(
        `${apiBase}/users/set-username`,
        {
          username,
          profilePhoto: finalPhotoUrl,
        },
        {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        }
      );

      const finalUsername = res.data.username || username;
      localStorage.setItem("user_Taspe7_Username", finalUsername);
      if (res.data?.token) {
        localStorage.setItem("user_Taspe7_Token", res.data.token);
      }

      const savedPhoto = res.data?.profilePhoto || finalPhotoUrl;
      if (savedPhoto) {
        localStorage.setItem("user_Taspe7_ProfilePhoto", savedPhoto);
      } else if (finalPhotoUrl === null) {
        localStorage.removeItem("user_Taspe7_ProfilePhoto");
      }

      if (onSuccess) onSuccess(res.data);
    } catch (err) {
      setStatus("taken");
      setStatusMsg(err.response?.data?.msg || "Failed to set username");
      setIsSubmitting(false);
      setIsUploadingPhoto(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl text-white my-auto">
          {/* Profile Picture Controls at the TOP */}
          <div className="flex flex-col items-center justify-center pt-1 pb-4">
            <div className="relative shrink-0">
              <div
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-sky-500/20 bg-black/40 flex items-center justify-center shadow-xl shadow-black/50 cursor-pointer"
                onClick={() => {
                  if (photoPreview) {
                    setIsViewingPhoto(true);
                  } else {
                    fileInputRef.current?.click();
                  }
                }}
                title={photoPreview ? "Click to view photo" : "Click to upload photo"}
              >
                {photoPreview ? (
                  <img
                    src={photoPreview}
                    alt="Profile"
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <span className="text-3xl sm:text-4xl font-bold text-sky-400/50 select-none">
                    {username?.charAt(0)?.toUpperCase() || initialSuggestion?.charAt(0)?.toUpperCase() || "U"}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingPhoto || isSubmitting}
                className="absolute bottom-0 right-0 translate-x-1 translate-y-1 w-8 h-8 sm:w-9 sm:h-9 bg-slate-900 rounded-full flex items-center justify-center border-2 border-sky-500/30 shadow-lg hover:bg-slate-800 transition-colors cursor-pointer"
                title={photoPreview ? "Change Photo" : "Upload Photo"}
              >
                {isUploadingPhoto ? (
                  <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4 text-sky-400" />
                )}
              </button>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/jpeg, image/png, image/webp"
                onChange={handleFileSelect}
              />
            </div>

            <p className="text-[11px] font-medium text-slate-400 mt-2">
              Profile Photo <span className="text-slate-500">(optional)</span>
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Form Header directly above Username input */}
            <div className="text-center pt-1 pb-1">


              <p className="text-xs sm:text-sm text-slate-400 mt-1.5 leading-relaxed">
                Spaces and symbols (@, !, ?, ^, ~, etc.) are not allowed. You can only use letters, numbers, and underscores (_).
              </p>
            </div>

            {/* Username Input Field */}
            <div>
              <label className="block text-xs font-semibold  tracking-wider text-slate-400 mb-1.5">
                Username
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3.5 text-slate-400 font-semibold text-base select-none">
                  @
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={handleInputChange}
                  maxLength={30}
                  required
                  autoFocus
                  placeholder="username"
                  className="w-full pl-8 pr-10 py-3 rounded-xl bg-slate-950 border border-slate-700 text-white placeholder-slate-600 focus:outline-none focus:border-sky-500 transition-colors text-sm font-mono"
                />
                {status === "checking" && (
                  <div className="absolute right-3 w-4 h-4 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
                )}
              </div>

              {statusMsg && (
                <p
                  className={`text-xs mt-2 flex items-center gap-1 font-medium ${
                    status === "available"
                      ? "text-emerald-400"
                      : status === "checking"
                      ? "text-sky-400"
                      : "text-rose-400"
                  }`}
                >
                  {statusMsg}
                </p>
              )}

              {/* Recommended suggestions chips */}
              <div className="mt-3.5 pt-3 border-t border-slate-800/80">
                <span className="text-[11px] font-semibold text-slate-400  tracking-wider block mb-2">
                  Recommended for you:
                </span>
                <div className="flex flex-wrap gap-2">
                  {recommendedHandles.map((handle) => (
                    <button
                      key={handle}
                      type="button"
                      onClick={() => handlePickSuggestion(handle)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition-colors ${
                        username === handle
                          ? "bg-sky-500/20 border-sky-500 text-sky-300 font-semibold"
                          : "bg-slate-800/80 border-slate-700 hover:border-slate-600 text-slate-300"
                      }`}
                    >
                      @{handle}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={status !== "available" || isSubmitting}
              className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all shadow-md flex items-center justify-center gap-2 ${
                status === "available" && !isSubmitting
                  ? "bg-sky-500 hover:bg-sky-400 text-white cursor-pointer active:scale-98"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-sky-200" />
                  <span>{isUploadingPhoto ? "Uploading photo..." : "Saving..."}</span>
                </>
              ) : (
                "Confirm @username"
              )}
            </button>

            {onCancel && (
              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isSubmitting}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors py-1 cursor-pointer"
                >
                  ← Use a different account or email
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* --- FULL IMAGE VIEWER MODAL (Identical to normal_UserProfile) --- */}
      <AnimatePresence>
        {isViewingPhoto && photoPreview && (
          <Portal>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsViewingPhoto(false)}
              className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-sm"
            >
              <div className="flex justify-between items-center p-4 bg-gradient-to-b from-black/80 to-transparent">
                <button
                  type="button"
                  onClick={() => setIsViewingPhoto(false)}
                  className="p-2 text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsViewingPhoto(false);
                      fileInputRef.current?.click();
                    }}
                    className="p-2 text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                    title="Change Photo"
                  >
                    <Edit3 className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePhotoRemove();
                    }}
                    className="p-2 text-rose-500 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                    title="Remove Photo"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                <motion.img
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  src={photoPreview}
                  alt="Profile"
                  className="max-w-full max-h-full object-contain"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>

      {/* --- IMAGE CROPPER MODAL (Identical to normal_UserProfile) --- */}
      <AnimatePresence>
        {photoToCrop && (
          <Portal>
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed inset-0 z-[110] flex flex-col bg-black"
            >
              <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={1}
                  ruleOfThirds
                  style={{ display: "block" }}
                >
                  <img
                    ref={imgRef}
                    src={photoToCrop}
                    onLoad={onImageLoad}
                    alt="Crop me"
                    style={{
                      maxWidth: "100vw",
                      maxHeight: "62vh",
                      width: "auto",
                      height: "auto",
                      display: "block",
                      transform: `rotate(${rotation}deg)`,
                    }}
                  />
                </ReactCrop>
              </div>
              <div className="px-6 py-5 bg-[#020817] flex justify-between items-center z-10 border-t border-sky-500/10">
                <button
                  type="button"
                  onClick={() => {
                    setPhotoToCrop(null);
                    setRotation(0);
                  }}
                  className="text-sky-500 hover:text-sky-400 font-semibold text-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setRotation((prev) => (prev + 90) % 360)}
                  className="p-3 rounded-full text-white hover:bg-white/10 transition-colors cursor-pointer"
                  title="Rotate"
                >
                  <RotateCcw className="w-6 h-6" />
                </button>
                <button
                  type="button"
                  onClick={confirmCrop}
                  className="text-sky-500 hover:text-sky-400 font-bold text-lg transition-colors flex items-center gap-2 cursor-pointer"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>

      {/* Identical ReactCrop styling */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
          .ReactCrop__crop-selection {
              border: none !important;
              box-shadow: none !important;
          }
          .ReactCrop__crop-selection::before {
              content: '';
              position: absolute;
              inset: 0;
              border: 1px solid rgba(255,255,255,0.75);
              pointer-events: none;
              z-index: 1;
          }
          .ReactCrop__crop-selection::after {
              content: '';
              position: absolute;
              inset: 0;
              background-image:
                  linear-gradient(to bottom, transparent calc(33.33% - 0.5px), rgba(255,255,255,0.4) calc(33.33% - 0.5px), rgba(255,255,255,0.4) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px)),
                  linear-gradient(to bottom, transparent calc(66.66% - 0.5px), rgba(255,255,255,0.4) calc(66.66% - 0.5px), rgba(255,255,255,0.4) calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px)),
                  linear-gradient(to right,  transparent calc(33.33% - 0.5px), rgba(255,255,255,0.4) calc(33.33% - 0.5px), rgba(255,255,255,0.4) calc(33.33% + 0.5px), transparent calc(33.33% + 0.5px)),
                  linear-gradient(to right,  transparent calc(66.66% - 0.5px), rgba(255,255,255,0.4) calc(66.66% - 0.5px), rgba(255,255,255,0.4) calc(66.66% + 0.5px), transparent calc(66.66% + 0.5px));
              pointer-events: none;
              z-index: 1;
          }
          .ReactCrop__drag-handle {
              background: transparent !important;
              border: none !important;
              box-shadow: none !important;
              width: 44px !important;
              height: 44px !important;
              opacity: 1 !important;
              z-index: 10;
              overflow: visible !important;
          }
          .ReactCrop__drag-handle::before,
          .ReactCrop__drag-handle::after {
              content: '';
              position: absolute;
              background: white;
              border-radius: 1px;
          }
          .ReactCrop__drag-handle.ord-nw { top: -2px !important; left: -2px !important; }
          .ReactCrop__drag-handle.ord-nw::before { top: 0; left: 0; width: 28px; height: 3px; }
          .ReactCrop__drag-handle.ord-nw::after  { top: 0; left: 0; width: 3px;  height: 28px; }
          .ReactCrop__drag-handle.ord-ne { top: -2px !important; right: -2px !important; left: auto !important; }
          .ReactCrop__drag-handle.ord-ne::before { top: 0; right: 0; width: 28px; height: 3px; }
          .ReactCrop__drag-handle.ord-ne::after  { top: 0; right: 0; width: 3px;  height: 28px; }
          .ReactCrop__drag-handle.ord-sw { bottom: -2px !important; left: -2px !important; top: auto !important; }
          .ReactCrop__drag-handle.ord-sw::before { bottom: 0; left: 0; width: 28px; height: 3px; }
          .ReactCrop__drag-handle.ord-sw::after  { bottom: 0; left: 0; width: 3px;  height: 28px; }
          .ReactCrop__drag-handle.ord-se { bottom: -2px !important; right: -2px !important; top: auto !important; left: auto !important; }
          .ReactCrop__drag-handle.ord-se::before { bottom: 0; right: 0; width: 28px; height: 3px; }
          .ReactCrop__drag-handle.ord-se::after  { bottom: 0; right: 0; width: 3px;  height: 28px; }
          .ReactCrop__drag-handle.ord-n  { top: -2px !important; left: 50% !important; transform: translateX(-50%) !important; width: 44px !important; height: 20px !important; }
          .ReactCrop__drag-handle.ord-n::before  { top: 0; left: 50%; transform: translateX(-50%); width: 24px; height: 3px; }
          .ReactCrop__drag-handle.ord-n::after   { display: none; }
          .ReactCrop__drag-handle.ord-s  { bottom: -2px !important; left: 50% !important; transform: translateX(-50%) !important; top: auto !important; width: 44px !important; height: 20px !important; }
          .ReactCrop__drag-handle.ord-s::before  { bottom: 0; left: 50%; transform: translateX(-50%); width: 24px; height: 3px; }
          .ReactCrop__drag-handle.ord-s::after   { display: none; }
          .ReactCrop__drag-handle.ord-e  { right: -2px !important; top: 50% !important; transform: translateY(-50%) !important; left: auto !important; width: 20px !important; height: 44px !important; }
          .ReactCrop__drag-handle.ord-e::before  { right: 0; top: 50%; transform: translateY(-50%); width: 3px; height: 24px; }
          .ReactCrop__drag-handle.ord-e::after   { display: none; }
          .ReactCrop__drag-handle.ord-w  { left: -2px !important; top: 50% !important; transform: translateY(-50%) !important; width: 20px !important; height: 44px !important; }
          .ReactCrop__drag-handle.ord-w::before  { left: 0; top: 50%; transform: translateY(-50%); width: 3px; height: 24px; }
          .ReactCrop__drag-handle.ord-w::after   { display: none; }
          .ReactCrop__rule-of-thirds-vt,
          .ReactCrop__rule-of-thirds-hz { display: none !important; }
        `,
        }}
      />
    </>
  );
}
