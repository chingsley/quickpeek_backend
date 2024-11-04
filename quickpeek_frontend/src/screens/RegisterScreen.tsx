import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';
import Constants from 'expo-constants';
import { useNavigation } from '@react-navigation/native';
import { registerUser as registerUserService } from '../services/auth';
import { AppDispatch, RootState } from '../store';
import { setLoading } from '../store/slices/loadingSlice';
import { CustomButton } from '../components';

export const RegisterScreen = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation();
  const isLoading = useSelector((state: RootState) => state.loading.isLoading);
  const { notificationToken, locationSharingEnabled } = useSelector((state: RootState) => state.permissions);
  const [formData, setFormData] = useState({
    name: 'Kingsley Eneja',
    username: 'chingsley',
    email: 'chingsleychinonso@gmail.com',
    password: 'SecurePassword',
    locationSharingEnabled,
    notificationsEnabled: !!notificationToken,
    deviceToken: notificationToken,
    deviceType: Constants.platform?.ios ? 'ios' : 'android'
  });

  const handleChange = (name: string, value: string) => {
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleRegister = async () => {
    console.log('\n\n Registration request payload ------->', notificationToken);
    try {
      const response = await registerUserService(formData);
      console.log('\n\n Registration response data ------> ', response);

      Alert.alert('Success', 'Registration successful');
      navigation.navigate('Login' as never);
    } catch (error) {
      console.log('error.resopnse:', error.response?.data);
      if (error.response) {
        console.log('API error message:', error.response.data);
        Alert.alert('Error', error.response.data.error);
      } else {
        console.log('Unexpected error:', error);
        Alert.alert('Error', 'Failed to register');
      }
    } finally {
      dispatch(setLoading(false));
    }
  };

  const allFieldsFilled = formData.name &&
    formData.username &&
    formData.email &&
    formData.password;

  return (
    <View style={styles.container}>
      <Text style={styles.headerText}>Register</Text>
      <Text>Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter full name"
        value={formData.name}
        onChangeText={(value) => handleChange('name', value)}
      />
      <Text>Usernname</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter Username"
        value={formData.username}
        onChangeText={(value) => handleChange('username', value)}
      />
      <Text>Email</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={formData.email}
        onChangeText={(value) => handleChange('email', value)}
      />
      <Text>Password</Text>
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={formData.password}
        onChangeText={(value) => handleChange('password', value)}
      />
      <CustomButton
        title="Register"
        onPress={handleRegister}
        disabled={!allFieldsFilled || isLoading}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center'
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
