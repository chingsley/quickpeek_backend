// src/store/slices/authSlice.ts
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
interface Location {
  longitude: number;
  latitude: number;
}

interface AuthState {
  isLoggedIn: boolean;
  token: string | null;
  user: {
    id: string;
    name: string;
    username: string;
    email: string;
    deviceType: string;
    deviceToken?: string;
    notificationsEnabled: boolean;
    locationSharingEnabled: boolean;
  } | null;
}

const initialState: AuthState = {
  isLoggedIn: false,
  user: null,
  token: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login: (state, action: PayloadAction<{ user: AuthState['user'], token: string; }>) => {
      state.isLoggedIn = true;
      state.token = action.payload.token;
      state.user = action.payload.user;
    },
    logout: (state) => {
      state.isLoggedIn = false;
      state.user = null;
      state.token = null;
    },
  },
});

export const { login, logout } = authSlice.actions;
export default authSlice.reducer;
