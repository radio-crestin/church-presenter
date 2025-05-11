import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface PresenterViewProps {
  windowSettings?: {
    x: number;
    y: number;
    width: number;
    height: number;
    isMaximized: boolean;
  };
  content?: string;
}

/**
 * The presenter view component that will be displayed in the secondary window
 */
const PresenterView: React.FC<PresenterViewProps> = ({ 
  windowSettings, 
  content = 'Presenter View'
}) => {
  // Log window settings when component mounts
  useEffect(() => {
    if (windowSettings) {
      console.log('Presenter view mounted with settings:', windowSettings);
    }
  }, [windowSettings]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {content}
      </Text>
      
      {/* Display window settings for debugging */}
      {windowSettings && (
        <View style={styles.debugContainer}>
          <Text style={styles.debugText}>
            Position: {windowSettings.x}, {windowSettings.y}
          </Text>
          <Text style={styles.debugText}>
            Size: {windowSettings.width} x {windowSettings.height}
          </Text>
          <Text style={styles.debugText}>
            Maximized: {windowSettings.isMaximized ? 'Yes' : 'No'}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    color: 'white',
    fontSize: 36,
    fontWeight: 'bold',
  },
  debugContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: '#333',
    padding: 8,
    borderRadius: 4,
  },
  debugText: {
    color: 'white',
    fontSize: 12,
  },
});

export default PresenterView;
