import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';

export const QuestionCreationScreen = () => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/v1/questions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer <user_token_here>',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, content, location: 'DummyLocation' }),
      });

      if (response.ok) {
        alert('Question posted successfully');
      } else {
        alert('Failed to post question');
      }
    } catch (error) {
      alert('Error posting question');
    }
  };

  return (
    <View style={styles.container}>
      <Text>Ask a Question</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Enter question title"
      />
      <Text>Content</Text>
      <TextInput
        style={styles.input}
        value={content}
        onChangeText={setContent}
        placeholder="Enter question content"
      />
      <Button title="Post Question" onPress={handleSubmit} />
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
