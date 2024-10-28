import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const NavigationBar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const slideAnim = useState(new Animated.Value(-width * 0.7))[0];
  const navigation = useNavigation();

  const toggleMenu = () => {
    if (isMenuOpen) {
      Animated.timing(slideAnim, {
        toValue: -width * 0.7,
        duration: 200,
        easing: Easing.ease,
        useNativeDriver: false,
      }).start(() => setIsMenuOpen(false));
    } else {
      setIsMenuOpen(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        easing: Easing.ease,
        useNativeDriver: false,
      }).start();
    }
  };

  const navigateTo = (screen: string) => {
    toggleMenu();
    navigation.navigate(screen as never);
  };

  return (
    <View style={styles.container}>
      {/* Web View Menu */}
      {Platform.OS === 'web' ? (
        <View style={styles.webMenu}>
          <TouchableOpacity onPress={() => navigateTo('Register')}>
            <Text style={styles.navItem}>Register</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigateTo('Login')}>
            <Text style={styles.navItem}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigateTo('Profile')}>
            <Text style={styles.navItem}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigateTo('QuestionCreation')}>
            <Text style={styles.navItem}>Ask Question</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Hamburger Icon */}
          <TouchableOpacity onPress={toggleMenu} style={styles.hamburgerIcon}>
            <Ionicons name={isMenuOpen ? 'close' : 'menu'} size={30} color="white" />
          </TouchableOpacity>

          {/* Overlay for closing menu */}
          {isMenuOpen && (
            <TouchableOpacity
              style={styles.overlay}
              onPress={toggleMenu} // Close menu when overlay is tapped
              activeOpacity={1}
            />
          )}

          {/* Sliding Menu */}
          <Animated.View style={[styles.menuContainer, { transform: [{ translateX: slideAnim }] }]}>
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
              <Text style={styles.menuItem}>Ask Question</Text>
            </TouchableOpacity>
          </Animated.View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    zIndex: 1,
    position: 'absolute',
    top: 0,
    width: '100%',
    backgroundColor: 'transparent',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width, // full screen width
    height: height, // full screen height
    backgroundColor: 'rgba(0, 0, 0, 0.5)', // Dark overlay with transparency
    zIndex: 9,
  },
  hamburgerIcon: {
    marginLeft: 15,
    marginTop: 110,
    backgroundColor: '#1a1a1a', // Dark background
    padding: 10,
    borderRadius: 25,
    width: 50,
    height: 50,
    zIndex: 2,
  },
  menuContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: width * 0.7, // 70% screen width
    height: height, // Full screen height
    backgroundColor: '#1a1a1a',
    zIndex: 10,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  menuItem: {
    color: '#fff',
    fontSize: 18,
    marginVertical: 20,
    textTransform: 'uppercase',
    textAlign: 'left',
  },
  webMenu: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    paddingVertical: 15,
    width: '100%',
  },
  navItem: {
    fontSize: 18,
    color: '#fff',
    textTransform: 'uppercase',
    paddingHorizontal: 15,
  },
});

export default NavigationBar;
