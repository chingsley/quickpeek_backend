import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { View, Text, TextInput, Alert, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Constants from 'expo-constants';
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
  const { notificationToken, locationSharingEnabled } = useSelector((state: RootState) => state.permissions);
  const [formData, setFormData] = useState({
    email: 'chingsleychinonso@gmail.com',
    password: 'SecurePassword',
    deviceType: Constants.platform?.ios ? 'ios' : 'android',
    deviceToken: notificationToken,
    notificationsEnabled: !!notificationToken,
    locationSharingEnabled,
  });

  const handleChange = (name: string, value: string) => {
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleLogin = async () => {
    try {

      console.log('\n\nlogin request payload: ------->', formData);
      const response = await loginUserService(formData);
      dispatch(login(response.data));
      navigation.navigate('QuestionCreation' as never);
    } catch (error) {
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
