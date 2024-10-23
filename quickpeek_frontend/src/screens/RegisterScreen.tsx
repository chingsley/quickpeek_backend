// src/pages/Register.tsx

import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registerUser as registerUserService } from '../services/auth'; // Update to use axios config
import { registerUser } from '../store/slices/userSlice';

const Register = () => {
  const dispatch = useDispatch();
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    locationSharingEnabled: true,
    notificationsEnabled: true,
  });

  const handleChange = (name: string, value: string) => {
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleRegister = async () => {
    try {
      // Get device type
      const deviceType = Constants.platform?.ios ? 'ios' : 'android';

      // Get location permissions and current location
      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      const location = locationStatus === 'granted'
        ? await Location.getCurrentPositionAsync()
        : null;

      // Get notification permissions and device token
      const { status: notifStatus } = await Notifications.getPermissionsAsync();
      const deviceToken = notifStatus === 'granted'
        ? (await Notifications.getExpoPushTokenAsync()).data
        : '';

      // Payload for registration
      const payload = {
        ...formData,
        deviceType,
        deviceToken,
        latitude: location?.coords.latitude,
        longitude: location?.coords.longitude,
        locationSharingEnabled: locationStatus === 'granted',
        notificationsEnabled: notifStatus === 'granted',
      };

      // Send registration payload to the backend
      await registerUserService(payload);
      dispatch(registerUser(payload));

      Alert.alert('Success', 'Registration successful');
    } catch (error) {
      Alert.alert('Error', 'Failed to register');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Register</Text>
      <TextInput
        style={styles.input}
        placeholder="Name"
        value={formData.name}
        onChangeText={(value) => handleChange('name', value)}
      />
      <TextInput
        style={styles.input}
        placeholder="Username"
        value={formData.username}
        onChangeText={(value) => handleChange('username', value)}
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={formData.email}
        onChangeText={(value) => handleChange('email', value)}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={formData.password}
        onChangeText={(value) => handleChange('password', value)}
      />
      <Button title="Register" onPress={handleRegister} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    flex: 1,
  },
  headerText: {
    fontSize: 24,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    padding: 10,
    marginBottom: 16,
    borderRadius: 4,
    borderColor: '#ccc',
  },
});

export default Register;
