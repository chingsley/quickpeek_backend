import React from 'react';
import AppNavigator from '../navigation/AppNavigator';
import { usePermissions } from '../hooks/usePermissions';

const AppInitializer = () => {
  usePermissions(); // Initialize permissions once on app load

  return <AppNavigator />;
};

export default AppInitializer;
