import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import PresenterControls from '../components/presenter/PresenterControls';

/**
 * Main screen of the application
 */
const MainScreen: React.FC = () => {
  const [presenterContent, setPresenterContent] = useState('Presenter View');

  // Handle content change from presenter controls
  const handleContentChange = (content: string) => {
    setPresenterContent(content);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.container}>
          <Text style={styles.title}>Church Presenter</Text>
          <Text style={styles.subtitle}>Control your presentation</Text>
          
          <View style={styles.divider} />
          
          <PresenterControls onContentChange={handleContentChange} />
          
          <View style={styles.previewContainer}>
            <Text style={styles.previewTitle}>Preview</Text>
            <View style={styles.previewContent}>
              <Text style={styles.previewText}>{presenterContent}</Text>
            </View>
          </View>
          
          <View style={styles.infoContainer}>
            <Text style={styles.infoTitle}>Instructions</Text>
            <Text style={styles.infoText}>
              1. Enter the content you want to display in the presenter window
            </Text>
            <Text style={styles.infoText}>
              2. Click "Open Presenter Window" to create a new window
            </Text>
            <Text style={styles.infoText}>
              3. Position and resize the window as needed
            </Text>
            <Text style={styles.infoText}>
              4. Click "Save Window Settings" to remember the position and size
            </Text>
            <Text style={styles.infoText}>
              5. Next time you open the presenter window, it will use the saved settings
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollView: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#ddd',
    marginVertical: 16,
  },
  previewContainer: {
    marginTop: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#eee',
  },
  previewTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  previewContent: {
    backgroundColor: '#000',
    padding: 24,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  previewText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  infoContainer: {
    marginTop: 24,
    marginBottom: 32,
    backgroundColor: '#f0f7ff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d0e1f9',
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#0066cc',
  },
  infoText: {
    marginBottom: 8,
    lineHeight: 20,
  },
});

export default MainScreen;
