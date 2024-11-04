import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// Async thunk to initialize location from AsyncStorage
export const initializeLocation = createAsyncThunk<
  { latitude: number; longitude: number; } | null
>('permissions/initializeLocation', async () => {
  const storedLocation = await AsyncStorage.getItem('previousLocation');
  return storedLocation ? JSON.parse(storedLocation) : null;
});

const permissionsSlice = createSlice({
  name: 'permissions',
  initialState,
  reducers: {
    setNotificationToken(state: PermissionsState, action: PayloadAction<string>) {
      state.notificationToken = action.payload;
    },
    setLocationSharingEnabled(state: PermissionsState, action: PayloadAction<boolean>) {
      state.locationSharingEnabled = action.payload;
    },

    setLocation(state: PermissionsState, action: PayloadAction<{ latitude: number; longitude: number; } | null>) {
      state.location = action.payload;

      // AsyncStorage call to persist location
      AsyncStorage.setItem('previousLocation', JSON.stringify(action.payload)).catch((error) =>
        console.error('Failed to save location:', error)
      );
    },
  },
  extraReducers: (builder) => {
    builder.addCase(
      initializeLocation.fulfilled,
      (state: PermissionsState, action: PayloadAction<{ latitude: number; longitude: number; } | null>) => {
        if (action.payload) {
          state.location = action.payload;
        }
      }
    );
  },
});

export const { setNotificationToken, setLocation, setLocationSharingEnabled } = permissionsSlice.actions;
export default permissionsSlice.reducer;
