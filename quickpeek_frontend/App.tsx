import React from 'react';
// import AppNavigator from './src/navigation/AppNavigator'; // Navigation setup
import { Provider } from 'react-redux';
import store from './src/store';
// import { usePermissions } from './src/hooks/usePermissions';
import AppInitializer from './src/components/AppInitializer';
// import { useLocationUpdater } from './src/hooks/useLocationUpdater';

const App = () => {
  // usePermissions(); // Initialize permissions once on app load
  // useLocationUpdater(); // Periodically update user location if locationSharing is allowed

  return (
    <Provider store={store}>
      <AppInitializer />
    </Provider>
  );
};

export default App;
