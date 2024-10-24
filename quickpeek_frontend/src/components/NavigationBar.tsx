import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Easing, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const NavigationBar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const slideAnim = useState(new Animated.Value(-210))[0]; // Menu starts off-screen
  const navigation = useNavigation();

  const toggleMenu = () => {
    if (isMenuOpen) {
      // Slide out menu
      Animated.timing(slideAnim, {
        toValue: -210,
        duration: 300,
        easing: Easing.ease,
        useNativeDriver: false,
      }).start();
    } else {
      // Slide in menu
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.ease,
        useNativeDriver: false,
      }).start();
    }
    setIsMenuOpen(!isMenuOpen);
  };

  const navigateTo = (screen: string) => {
    toggleMenu(); // Close menu after navigating
    navigation.navigate(screen as never);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Hamburger Icon */}
        <TouchableOpacity onPress={toggleMenu} style={styles.hamburgerIcon}>
          <Ionicons name={isMenuOpen ? 'close' : 'menu'} size={30} color="white" />
        </TouchableOpacity>

        {/* Sliding Menu */}
        <Animated.View style={[styles.menuContainer, { left: slideAnim }]}>
          <TouchableOpacity onPress={() => navigateTo('Login')}>
            <Text style={styles.menuItem}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigateTo('Register')}>
            <Text style={styles.menuItem}>Register</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigateTo('Profile')}>
            <Text style={styles.menuItem}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigateTo('QuestionCreation')}>
            <Text style={styles.menuItem}>Create Question</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'black',
  },
  container: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 15,
    zIndex: 10,
  },
  hamburgerIcon: {
    marginLeft: 15,  // Slight padding to keep it within the safe area
    marginTop: 20,
    zIndex: 11,
  },
  menuContainer: {
    position: 'absolute',
    top: 0,
    left: -210,
    width: 210,
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    zIndex: 10,
    paddingTop: 60,
    paddingHorizontal: 10,
  },
  menuItem: {
    color: '#fff',
    fontSize: 18,
    marginVertical: 20,
    textTransform: 'uppercase',
    textAlign: 'left',
  },
});

export default NavigationBar;
