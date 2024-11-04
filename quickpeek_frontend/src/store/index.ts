// src/store/index.ts
import { configureStore } from '@reduxjs/toolkit';
import { useDispatch } from 'react-redux';
import authReducer from './slices/authSlice';
import userReducer from './slices/userSlice';
import loadingReducer from './slices/loadingSlice';
import permissionsReducer from './slices/permissionsSlice';

const store = configureStore({
  reducer: {
    auth: authReducer,
    user: userReducer,
    loading: loadingReducer,
    permissions: permissionsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = () => useDispatch<AppDispatch>();
export default store;
