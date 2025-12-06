/**
 * NeoClip Production - Expo React Native App
 * Zero-cost video generation mobile app
 * 
 * SECURITY: API URL is configured via environment
 * No sensitive keys stored in the app
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Dimensions,
} from 'react-native';
import { Video } from 'expo-av';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

// API Base URL - Configure in app.json extra field
const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || 'https://your-vercel-app.vercel.app';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function App() {
  // State
  const [prompt, setPrompt] = useState('');
  const [videoUrl, setVideoUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [user, setUser] = useState(null);
  const [tier, setTier] = useState('free');
  const [error, setError] = useState(null);
  const [generations, setGenerations] = useState([]);

  // Initialize user on app load
  useEffect(() => {
    initializeUser();
  }, []);

  const initializeUser = async () => {
    try {
      const deviceId = Device.deviceName || `device-${Date.now()}`;
      
      const response = await fetch(`${API_BASE_URL}/api/user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      
      const data = await response.json();
      
      if (data.success && data.user) {
        setUser(data.user);
        setTier(data.user.tier);
        fetchUserGenerations(data.user.id);
      }
    } catch (err) {
      console.error('Failed to initialize user:', err);
      setError('Failed to connect to server. Please check your internet connection.');
    }
  };

  const fetchUserGenerations = async (userId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/status?userId=${userId}`);
      const data = await response.json();
      
      if (data.success && data.generations) {
        setGenerations(data.generations);
      }
    } catch (err) {
      console.error('Failed to fetch generations:', err);
    }
  };

  const generateVideo = async () => {
    if (!prompt.trim()) {
      Alert.alert('Error', 'Please enter a prompt to generate a video');
      return;
    }

    if (!user) {
      Alert.alert('Error', 'User not initialized. Please restart the app.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setVideoUrl(null);
    setLoadingMessage('Starting video generation...');

    try {
      const response = await fetch(`${API_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          userId: user.id,
          tier,
          length: tier === 'free' ? 10 : 30,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402) {
          Alert.alert(
            'Free Limit Reached',
            data.message || 'You have used all your free clips this month. Upgrade to Pro for unlimited HD clips!',
            [
              { text: 'Maybe Later', style: 'cancel' },
              { text: 'Upgrade Now', onPress: () => handleUpgrade() },
            ]
          );
          throw new Error('Free limit reached');
        }
        throw new Error(data.error || 'Generation failed');
      }

      if (data.success && data.videoUrl) {
        setVideoUrl(data.videoUrl);
        setLoadingMessage('');
        
        // Update user's remaining free clips
        if (data.remainingFree !== null) {
          setUser(prev => ({
            ...prev,
            free_used: 10 - data.remainingFree,
            freeRemaining: data.remainingFree,
          }));
        }
        
        // Refresh generations list
        fetchUserGenerations(user.id);
      }
    } catch (err) {
      console.error('Generation error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  };

  const handleUpgrade = () => {
    // TODO: Implement payment flow
    Alert.alert(
      'Upgrade to Pro',
      'Pro features coming soon!\n\n• 120 HD clips/month\n• 30s max length\n• 1080p quality\n• No ads\n\nOnly $4.99/month',
      [{ text: 'OK' }]
    );
  };

  const renderUserStats = () => {
    if (!user) return null;

    const freeRemaining = user.freeRemaining ?? (10 - (user.free_used || 0));
    const daysUntilReset = user.daysUntilReset || 0;

    return (
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{freeRemaining}</Text>
          <Text style={styles.statLabel}>Free clips left</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{daysUntilReset}</Text>
          <Text style={styles.statLabel}>Days to reset</Text>
        </View>
        <TouchableOpacity style={styles.upgradeButton} onPress={handleUpgrade}>
          <Text style={styles.upgradeButtonText}>Upgrade</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTierToggle = () => (
    <View style={styles.tierToggle}>
      <TouchableOpacity
        style={[styles.tierButton, tier === 'free' && styles.tierButtonActive]}
        onPress={() => setTier('free')}
      >
        <Text style={[styles.tierButtonText, tier === 'free' && styles.tierButtonTextActive]}>
          Free (10s)
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tierButton, tier === 'paid' && styles.tierButtonActive]}
        onPress={() => setTier('paid')}
      >
        <Text style={[styles.tierButtonText, tier === 'paid' && styles.tierButtonTextActive]}>
          Pro (30s HD)
        </Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>NeoClip</Text>
          <Text style={styles.subtitle}>AI Video Generator</Text>
        </View>

        {/* User Stats */}
        {renderUserStats()}

        {/* Tier Toggle */}
        {renderTierToggle()}

        {/* Prompt Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Describe your video... (e.g., 'A cat playing piano in space')"
            placeholderTextColor="#888"
            multiline
            numberOfLines={3}
            maxLength={500}
          />
          <Text style={styles.charCount}>{prompt.length}/500</Text>
        </View>

        {/* Generate Button */}
        <TouchableOpacity
          style={[styles.generateButton, isLoading && styles.generateButtonDisabled]}
          onPress={generateVideo}
          disabled={isLoading}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.generateButtonText}>
                {loadingMessage || 'Generating...'}
              </Text>
            </View>
          ) : (
            <Text style={styles.generateButtonText}>
              Generate {tier === 'free' ? '10s FREE' : '30s HD'} Video
            </Text>
          )}
        </TouchableOpacity>

        {/* Error Message */}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Video Player */}
        {videoUrl && (
          <View style={styles.videoContainer}>
            <Text style={styles.videoTitle}>Your Generated Video</Text>
            <Video
              source={{ uri: videoUrl }}
              style={styles.video}
              useNativeControls
              resizeMode="contain"
              isLooping
              shouldPlay
            />
            {tier === 'free' && (
              <View style={styles.adBanner}>
                <Text style={styles.adText}>
                  Upgrade to Pro to remove ads and get 1080p quality!
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Recent Generations */}
        {generations.length > 0 && (
          <View style={styles.historyContainer}>
            <Text style={styles.historyTitle}>Recent Generations</Text>
            {generations.slice(0, 5).map((gen, index) => (
              <TouchableOpacity
                key={gen.id || index}
                style={styles.historyItem}
                onPress={() => gen.videoUrl && setVideoUrl(gen.videoUrl)}
              >
                <Text style={styles.historyPrompt} numberOfLines={1}>
                  {gen.prompt}
                </Text>
                <Text style={styles.historyTier}>
                  {gen.tier === 'free' ? '🎬 Free' : '⭐ Pro'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#00ff88',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  upgradeButton: {
    backgroundColor: '#ff6b00',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  upgradeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  tierToggle: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
  },
  tierButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  tierButtonActive: {
    backgroundColor: '#333',
  },
  tierButtonText: {
    color: '#888',
    fontWeight: '600',
  },
  tierButtonTextActive: {
    color: '#00ff88',
  },
  inputContainer: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#333',
  },
  charCount: {
    color: '#666',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  generateButton: {
    backgroundColor: '#00ff88',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  generateButtonDisabled: {
    backgroundColor: '#004d29',
  },
  generateButtonText: {
    color: '#0a0a0a',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorContainer: {
    backgroundColor: '#ff4444',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#fff',
    textAlign: 'center',
  },
  videoContainer: {
    marginBottom: 20,
  },
  videoTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  video: {
    width: SCREEN_WIDTH - 40,
    height: (SCREEN_WIDTH - 40) * (16 / 9),
    borderRadius: 12,
    backgroundColor: '#1a1a1a',
  },
  adBanner: {
    backgroundColor: '#ff6b00',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  adText: {
    color: '#fff',
    textAlign: 'center',
    fontSize: 13,
  },
  historyContainer: {
    marginTop: 10,
  },
  historyTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  historyItem: {
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyPrompt: {
    color: '#ccc',
    flex: 1,
    marginRight: 10,
  },
  historyTier: {
    color: '#888',
    fontSize: 12,
  },
});
