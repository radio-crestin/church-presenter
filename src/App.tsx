/**
 * Church Presenter App
 * A React Native Windows application for church presentations
 *
 * @format
 */

import React, { useEffect } from 'react';
import { StatusBar, Platform, AppRegistry } from 'react-native';
import MainScreen from './screens/MainScreen';
import PresenterView from './components/presenter/PresenterView';

// Register the presenter view component for use in secondary windows
if (Platform.OS === 'windows') {
  AppRegistry.registerComponent('PresenterView', () => PresenterView);
}

function App(): React.JSX.Element {
  // Log when the app starts
  useEffect(() => {
    console.log('Church Presenter app started');
  }, []);

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <MainScreen />
    </>
  );
}

export default App;
