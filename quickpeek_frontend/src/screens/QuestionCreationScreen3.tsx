import React, { useState, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import BottomSheet from 'reanimated-bottom-sheet';
import { GooglePlacesAutocomplete } from 'react-native-google-places-autocomplete';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '../store';
import { postQuestion } from '../services/question';
import { CustomButton } from '../components';

export const QuestionCreationScreen = () => {
  const dispatch = useDispatch<AppDispatch>();
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    location: null as { latitude: number; longitude: number; } | null,
    address: '',
  });
  const [mapRegion, setMapRegion] = useState({
    latitude: 37.78825,
    longitude: -122.4324,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });
  const { isLoggedIn } = useSelector((state: RootState) => state.auth);
  const sheetRef = useRef(null);

  const handleLocationSelect = (details: any) => {
    const { lat, lng } = details.geometry.location;
    setFormData({
      ...formData,
      location: { latitude: lat, longitude: lng },
      address: details.formatted_address,
    });
    setMapRegion({
      ...mapRegion,
      latitude: lat,
      longitude: lng,
    });
  };

  const handleSubmit = async () => {
    if (!isLoggedIn) {
      Alert.alert("Error", "Please log in to post a question");
      return;
    }
    try {
      await postQuestion({
        ...formData,
        latitude: formData.location?.latitude,
        longitude: formData.location?.longitude,
      });
      Alert.alert('Success', 'Question posted successfully!');
      setFormData({ title: '', content: '', location: null, address: '' });
    } catch (error) {
      console.error("Failed to post question:", error);
      Alert.alert('Error', 'Unable to post your question.');
    }
  };

  const renderBottomSheetContent = () => (
    <View style={styles.sheetContent}>
      <Text>Enter Your Question</Text>
      <TextInput
        style={styles.input}
        placeholder="Question title"
        value={formData.title}
        onChangeText={(text) => setFormData({ ...formData, title: text })}
      />
      <TextInput
        style={[styles.input, { height: 60 }]}
        placeholder="Question details"
        value={formData.content}
        onChangeText={(text) => setFormData({ ...formData, content: text })}
        multiline
      />
      <CustomButton title="Submit Question" onPress={handleSubmit} />
    </View>
  );

  return (
    <View style={styles.container}>
      <GooglePlacesAutocomplete
        placeholder="Search location"
        onPress={(data: any, details = null) => details && handleLocationSelect(details)}
        query={{
          key: 'YOUR_GOOGLE_MAPS_API_KEY',
          language: 'en',
        }}
        fetchDetails={true}
        styles={{
          container: styles.autoCompleteContainer,
          textInput: styles.autoCompleteTextInput,
        }}
      />

      <MapView
        style={styles.map}
        region={mapRegion}
        onRegionChangeComplete={setMapRegion}
      >
        {formData.location && (
          <Marker coordinate={formData.location} title={formData.address} />
        )}
      </MapView>

      <BottomSheet
        ref={sheetRef}
        snapPoints={[300, 150, 0]}
        borderRadius={10}
        renderContent={renderBottomSheetContent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width: '100%',
    height: '60%',
  },
  autoCompleteContainer: {
    position: 'absolute',
    top: 10,
    width: '100%',
    zIndex: 1,
  },
  autoCompleteTextInput: {
    height: 40,
    backgroundColor: '#FFF',
    borderRadius: 5,
    paddingHorizontal: 10,
  },
  sheetContent: {
    backgroundColor: '#fff',
    padding: 20,
    height: 300,
  },
  input: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    marginVertical: 10,
    paddingHorizontal: 8,
  },
});

// export default QuestionCreationScreen;
