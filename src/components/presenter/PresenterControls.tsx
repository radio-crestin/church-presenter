import React, { useState } from 'react';
import { View, Text, Button, TextInput, StyleSheet, Platform } from 'react-native';
import { useWindowManager } from '../../hooks/useWindowManager';

interface PresenterControlsProps {
  onContentChange?: (content: string) => void;
}

/**
 * Controls for managing the presenter window
 */
const PresenterControls: React.FC<PresenterControlsProps> = ({
  onContentChange,
}) => {
  const {
    isSupported,
    presenterWindowId,
    windowSettings,
    displays,
    createPresenterWindow,
    closePresenterWindow,
    saveCurrentWindowSettings,
    isLoading,
  } = useWindowManager();

  const [content, setContent] = useState('Presenter View');

  // Handle content change
  const handleContentChange = (text: string) => {
    setContent(text);
    if (onContentChange) {
      onContentChange(text);
    }
  };

  // Create presenter window
  const handleCreateWindow = async () => {
    await createPresenterWindow({ content });
  };

  // Close presenter window
  const handleCloseWindow = async () => {
    await closePresenterWindow();
  };

  // Save window settings
  const handleSaveSettings = async () => {
    await saveCurrentWindowSettings();
  };

  if (!isSupported) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Multiple windows are not supported on this platform.
          This feature is only available on Windows.
        </Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Presenter Controls</Text>
      
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Presenter Content:</Text>
        <TextInput
          style={styles.input}
          value={content}
          onChangeText={handleContentChange}
          placeholder="Enter content to display"
        />
      </View>

      <View style={styles.buttonContainer}>
        {presenterWindowId === null ? (
          <Button
            title="Open Presenter Window"
            onPress={handleCreateWindow}
          />
        ) : (
          <>
            <Button
              title="Close Presenter Window"
              onPress={handleCloseWindow}
              color="#ff3b30"
            />
            <View style={styles.buttonSpacer} />
            <Button
              title="Save Window Settings"
              onPress={handleSaveSettings}
            />
          </>
        )}
      </View>

      {windowSettings && (
        <View style={styles.settingsContainer}>
          <Text style={styles.settingsTitle}>Current Window Settings:</Text>
          <Text>Position: {windowSettings.x}, {windowSettings.y}</Text>
          <Text>Size: {windowSettings.width} x {windowSettings.height}</Text>
          <Text>Maximized: {windowSettings.isMaximized ? 'Yes' : 'No'}</Text>
        </View>
      )}

      {displays.length > 0 && (
        <View style={styles.displaysContainer}>
          <Text style={styles.settingsTitle}>Available Displays:</Text>
          {displays.map((display) => (
            <Text key={display.id}>
              {display.name} ({display.bounds.width} x {display.bounds.height})
            </Text>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    margin: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  errorText: {
    color: '#ff3b30',
    marginBottom: 8,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 4,
    padding: 8,
    backgroundColor: 'white',
  },
  buttonContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  buttonSpacer: {
    width: 16,
  },
  settingsContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#eee',
  },
  displaysContainer: {
    marginTop: 16,
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#eee',
  },
  settingsTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
});

export default PresenterControls;
