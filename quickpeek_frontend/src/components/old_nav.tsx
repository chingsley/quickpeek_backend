import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons'; // For hamburger menu icon

const NavigationBar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const navigation = useNavigation();

  const toggleMenu = () => {
    console.log('\nworking.......\n');
    setIsMenuOpen(!isMenuOpen);
  };

  const handleNavigation = (route: string) => {
    setIsMenuOpen(false); // Close the menu after navigating
    navigation.navigate(route as never); // Navigate to the selected page
  };

  return (
    <View style={styles.navContainer}>
      {/* Hamburger Menu for Mobile */}
      {Platform.OS === 'web' ? (
        <View style={styles.webMenu}>
          <TouchableOpacity onPress={() => handleNavigation('Register')}>
            <Text style={styles.navItem}>Register</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleNavigation('Login')}>
            <Text style={styles.navItem}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleNavigation('Profile')}>
            <Text style={styles.navItem}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleNavigation('QuestionCreation')}>
            <Text style={styles.navItem}>Ask Question</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.mobileMenu}>
          <TouchableOpacity onPress={toggleMenu}>
            <Ionicons name="menu" size={32} color="black" />
          </TouchableOpacity>
          {isMenuOpen && (
            <View style={styles.mobileMenuItems}>
              <TouchableOpacity onPress={() => handleNavigation('Register')}>
                <Text style={styles.navItem}>Register</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleNavigation('Login')}>
                <Text style={styles.navItem}>Login</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleNavigation('Profile')}>
                <Text style={styles.navItem}>Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleNavigation('QuestionCreation')}>
                <Text style={styles.navItem}>Ask Question</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  navContainer: {
    padding: 16,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
    marginTop: 80,
  },
  webMenu: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  mobileMenu: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  mobileMenuItems: {
    marginTop: 8,
  },
  navItem: {
    fontSize: 18,
    marginVertical: 8,
  },
});

export default NavigationBar;
