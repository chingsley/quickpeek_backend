import React, { useState, useEffect } from 'react';
import { useNavigation } from '@react-navigation/native';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../store';
import { CustomButton } from '../components';
import { setLoading } from '../store/slices/loadingSlice';
import { postQuestion } from '../services/question';

export const QuestionCreationScreen = () => {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation();
  const [formData, setFormData] = useState({
    title: 'Queue check',
    content: 'How long is the queue at NNPC filling station katampe?',
    location: '-65.79952838533883, 46.44924450104387'
  });
  const { isLoggedIn } = useSelector((state: RootState) => state.auth);
  const { isLoading } = useSelector((state: RootState) => state.loading);

  const handleChange = (name: string, value: string) => {
    setFormData({
      ...formData,
      [name]: value,
    });
  };
  const clearForm = () => setFormData({ title: '', content: '', location: '' });


  const handleSubmit = async () => {
    try {
      if (!isLoggedIn) {
        navigation.navigate('Login' as never);
        return;
      }

      const payload = { ...formData };
      await postQuestion(payload);
      Alert.alert('Success', 'Question sent!');
      clearForm();
    } catch (error) {
      console.log('error.resopnse:', error.response?.data);
      if (error.response) {
        console.log('API error message:', error.response.data);
        Alert.alert('Error', error.response.data.error);
      } else {
        console.log('Unexpected error:', error);
        Alert.alert('Error', 'Failed to post question');
      }
    } finally {
      dispatch(setLoading(false));
    }
  };

  const allFieldsFilled = formData.title && formData.content;

  return (
    <View style={styles.container}>
      <Text>Ask a Question</Text>
      <TextInput
        style={styles.input}
        value={formData.title}
        onChangeText={(value) => handleChange('title', value)}
        placeholder="Enter question title"
      />
      <Text>Content</Text>
      <TextInput
        style={styles.input}
        value={formData.content}
        onChangeText={(value) => handleChange('content', value)}
        placeholder="Enter question content"
      />
      <CustomButton
        title='Post Question'
        onPress={handleSubmit}
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
