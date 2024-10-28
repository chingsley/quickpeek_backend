import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const ProfileScreen = () => {
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    // Fetch user's profile data
    const fetchProfile = async () => {
      // const response = await fetch('http://localhost:3000/api/v1/users', {
      //   method: 'GET',
      //   headers: {
      //     'Authorization': 'Bearer <user_token_here>',
      //   },
      // });
      // const data = await response.json();
      // setProfile(data);
    };

    fetchProfile();
  }, []);

  if (!profile) return <Text>Loading...</Text>;

  return (
    <View style={styles.container}>
      <Text>Name: {profile.name}</Text>
      <Text>Username: {profile.username}</Text>
      <Text>Questions Asked: {profile.questionsCount}</Text>
      <Text>Answers Given: {profile.answersCount}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
});
