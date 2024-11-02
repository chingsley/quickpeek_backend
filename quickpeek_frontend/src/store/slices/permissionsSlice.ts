import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface PermissionsState {
  notificationToken: string | null;
  locationSharingEnabled: boolean;
  location: { latitude: number; longitude: number; } | null;
}

const initialState: PermissionsState = {
  notificationToken: null,
  location: null,
  locationSharingEnabled: false,
};

const permissionsSlice = createSlice({
  name: 'permissions',
  initialState,
  reducers: {
    setNotificationToken(state, action: PayloadAction<string>) {
      state.notificationToken = action.payload;
    },
    setLocation(state, action: PayloadAction<{ latitude: number; longitude: number; }>) {
      state.location = action.payload;
      state.locationSharingEnabled = true;
    },
  },
});

export const { setNotificationToken, setLocation } = permissionsSlice.actions;
export default permissionsSlice.reducer;
