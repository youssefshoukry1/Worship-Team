"use client";

import { createContext, useState, useEffect, useRef } from "react";
import axios from "axios";
import { syncFcmTokenWithBackend } from "../services/pushNotificationService";
import { uploadProfilePhotoBlob } from '../utils/profilePhoto';
import { saveAvatarBlob } from '../utils/avatarStorage';
import { invalidateProfile, readCachedProfile, writeCachedProfile } from '../utils/profileCache';
import { getApiBaseUrl } from '../utils/apiBase';
import { showToast } from '../components/ToastContainer';

export const UserContext = createContext();

const API_URL = "https://worship-team-api.onrender.com/api";

export default function UserContextProvider({ children }) {

  const [isLogin, setLogin] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_Token") || null;
  });

  const [UserRole, setUserRole] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_GlobalRole")?.trim() || null;
  });

  const [subRole, setSubRole] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_SubRole")?.trim() || null;
  });

  const [user_id, setUser_id] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_ID") || null;
  });

  const [churchId, setChurchId] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_ChurchId") || null;
  });

  const [HymnIds, setHymnIds] = useState(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("user_Taspe7_HymnIds");
    return saved ? JSON.parse(saved) : [];
  });

  const [UserStatus, setUserStatus] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_Status")?.trim() || null;
  });

  const [teams, setTeams] = useState(() => {
    if (typeof window === "undefined") return [];
    const saved = localStorage.getItem("user_Taspe7_Teams");
    try { return saved ? JSON.parse(saved) : []; } catch { return []; }
  });

  const [username, setUsername] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_Username") || null;
  });

  const [profilePhoto, setProfilePhoto] = useState(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("user_Taspe7_ProfilePhoto") || null;
  });

  // The provider outlives profile-page navigation, so the preview and upload do too.
  const [photoPreview, setPhotoPreview] = useState(null);
  const [uploadingPhotoFor, setUploadingPhotoFor] = useState(null);
  const photoUpload = useRef(null);
  const previewUser = photoPreview?.userId === user_id && photoPreview?.token === isLogin;
  const profilePhotoPreview = previewUser ? photoPreview.src : null;
  const isUploadingProfilePhoto = uploadingPhotoFor === user_id && !!user_id;

  useEffect(() => {
    const src = photoPreview?.src;
    return () => { if (src) URL.revokeObjectURL(src); };
  }, [photoPreview]);

  const clearProfilePhotoPreview = () => setPhotoPreview(null);

  const uploadProfilePhoto = async (blob) => {
    if (!user_id || !isLogin || photoUpload.current) return;
    const userId = user_id;
    const token = isLogin;
    const apiBase = getApiBaseUrl();
    const task = {};
    photoUpload.current = task;
    setUploadingPhotoFor(userId);
    setPhotoPreview({ userId, token, src: URL.createObjectURL(blob) });
    const isCurrentAccount = () => localStorage.getItem('user_Taspe7_ID') === userId
      && localStorage.getItem('user_Taspe7_Token') === token;

    try {
      const remoteUrl = await uploadProfilePhotoBlob(apiBase, token, blob);
      if (!isCurrentAccount()) return;
      setProfilePhoto(remoteUrl);
      localStorage.setItem('user_Taspe7_ProfilePhoto', remoteUrl);
      invalidateProfile(apiBase, token);
      // Persistence must not delay rendering or turn a successful upload into a failure.
      saveAvatarBlob(userId, remoteUrl, blob).catch(console.warn);
      readCachedProfile(userId).then(profile => {
        if (profile && isCurrentAccount()) {
          return writeCachedProfile(userId, { ...profile, user: { ...profile.user, profilePhoto: remoteUrl } });
        }
      }).catch(console.warn);
      showToast({ message: 'Profile photo updated!', type: 'success' });
    } catch (error) {
      if (isCurrentAccount()) {
        clearProfilePhotoPreview();
        showToast({ message: error.message || 'Photo upload failed. Please try again.', type: 'error' });
      }
    } finally {
      if (photoUpload.current === task) {
        photoUpload.current = null;
        setUploadingPhotoFor(null);
      }
    }
  };

  const [vocalsMode, setVocalsMode] = useState(true);

  const refreshTeams = async () => {
    const token = localStorage.getItem("user_Taspe7_Token");
    if (!token) return;
    try {
      const res = await axios.get(`${API_URL}/users/my-teams`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data) {
        setTeams(res.data);
        localStorage.setItem("user_Taspe7_Teams", JSON.stringify(res.data));
      }
    } catch (err) {
      console.error("Failed to refresh teams:", err);
    }
  };

  useEffect(() => {
    if (isLogin) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      refreshTeams();
      syncFcmTokenWithBackend();
    }
  }, [isLogin]);

  // Switch the active team: calls backend, refreshes JWT + context
  const switchTeam = async (team) => {
    const token = localStorage.getItem("user_Taspe7_Token");
    const res = await axios.patch(`${API_URL}/users/switch-team`, { churchId: team.churchId }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const { token: newToken, activeTeam } = res.data;
    localStorage.setItem("user_Taspe7_Token", newToken);
    localStorage.setItem("user_Taspe7_ChurchId", activeTeam.churchId);
    localStorage.setItem("user_Taspe7_GlobalRole", activeTeam.global_role || UserRole);
    localStorage.setItem("user_Taspe7_SubRole", activeTeam.sub_role);
    localStorage.setItem("user_Taspe7_Status", activeTeam.status);
    setLogin(newToken);
    setChurchId(activeTeam.churchId);
    if (activeTeam.global_role) setUserRole(activeTeam.global_role);
    setSubRole(activeTeam.sub_role);
    setUserStatus(activeTeam.status);
  };

    const teamId = churchId;
    const setTeamId = setChurchId;

    return (
      <UserContext.Provider value={{
        isLogin, setLogin,
        UserRole, setUserRole,
        subRole, setSubRole,
        user_id, setUser_id,
        churchId, setChurchId,
        teamId, setTeamId,
        HymnIds, setHymnIds,
        vocalsMode, setVocalsMode,
        UserStatus, setUserStatus,
        teams, setTeams,
        username, setUsername,
        profilePhoto, setProfilePhoto,
        profilePhotoPreview, clearProfilePhotoPreview, isUploadingProfilePhoto, uploadProfilePhoto,
        switchTeam,
        refreshTeams
      }}>
      {children}
    </UserContext.Provider>
  );
}
