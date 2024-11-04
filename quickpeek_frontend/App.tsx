import React from 'react';
import { Provider } from 'react-redux';
import store from './src/store';
import AppInitializer from './src/components/AppInitializer';

const App = () => {
  return (
    <Provider store={store}>
      <AppInitializer />
    </Provider>
  );
};

export default App;
