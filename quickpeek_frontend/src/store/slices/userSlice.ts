import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UserState {
  id: string;
  name: string;
  username: string;
  email: string;
  deviceType: string;
  deviceToken: string;
  // locationSharingEnabled: boolean;
  notificationsEnabled: boolean;
  latitude?: number;
  longitude?: number;
}

const initialState: UserState = {
  id: '',
  name: '',
  username: '',
  email: '',
  deviceType: '',
  deviceToken: '',
  // locationSharingEnabled: true,
  notificationsEnabled: true,
};

const userSlice = createSlice({
  name: 'user',
  initialState,
  reducers: {
    registerUser: (state, action: PayloadAction<UserState>) => {
      return { ...state, ...action.payload };
    },
    updateUserLocation: (
      state,
      action: PayloadAction<{ latitude: number; longitude: number; }>
    ) => {
      state.latitude = action.payload.latitude;
      state.longitude = action.payload.longitude;
    },
  },
});

export const { registerUser, updateUserLocation } = userSlice.actions;
export default userSlice.reducer;
