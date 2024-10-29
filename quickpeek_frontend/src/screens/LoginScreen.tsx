import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { AppDispatch, RootState } from '../store';
import { loginUser as loginUserService } from '../services/auth'; // Update to use axios config
import { login } from '../store/slices/authSlice';
import { setLoading } from '../store/slices/loadingSlice';
import { LoginScreenNavigationProp } from '../navigation/types';
import { CustomButton } from '../components';

export const LoginScreen = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<LoginScreenNavigationProp>();
  const isLoading = useSelector((state: RootState) => state.loading.isLoading);
  const [formData, setFormData] = useState({
    email: 'chingsleychinonso@gmail.com',
    password: 'SecurePassword',
    deviceType: 'ios',
    deviceToken: 'dummyToken'
  });

  const handleChange = (name: string, value: string) => {
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleLogin = async () => {
    try {
      const deviceType = Constants.platform?.ios ? 'ios' : 'android';

      // Get notification permissions and device token
      const { status: notifStatus } = await Notifications.getPermissionsAsync();
      console.log(Constants.expoConfig?.extra?.eas?.projectId);
      const deviceToken = notifStatus === 'granted'
        ? (await Notifications.getExpoPushTokenAsync({
          projectId: Constants.expoConfig?.extra?.eas?.projectId,
        })).data
        : '';

      const payload = { ...formData, deviceType, deviceToken };
      const response = await loginUserService(payload);
      dispatch(login(response.data));
      navigation.navigate('QuestionCreation' as never);
    } catch (error) {
      // alert('Login failed');
      console.log('error.resopnse:', error.response?.data);
      if (error.response) {
        // Log the specific error message from the backend
        console.log('API error message:', error.response.data);
        Alert.alert('Error', error.response.data.error);
      } else {
        console.log('Unexpected error:', error);
        Alert.alert('Error', 'Failed to login');
      }
    } finally {
      dispatch(setLoading(false));
    }
  };

  const allFieldsFilled = formData.email &&
    formData.password;

  return (
    <View style={styles.container}>
      <Text>Email</Text>
      <TextInput
        style={styles.input}
        value={formData.email}
        onChangeText={(value) => handleChange('email', value)}
        placeholder="Enter email"
      />
      <Text>Password</Text>
      <TextInput
        style={styles.input}
        value={formData.password}
        onChangeText={(value) => handleChange('password', value)}
        secureTextEntry
        placeholder="Enter password"
      />
      <CustomButton
        title="Login"
        onPress={handleLogin}
        disabled={!allFieldsFilled || isLoading}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 10,
  },
});
