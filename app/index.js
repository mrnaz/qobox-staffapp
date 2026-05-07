import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './services/api';

export default function Index() {
    const [target, setTarget] = useState(null);

    useEffect(() => {
        (async () => {
            const token = await AsyncStorage.getItem('authToken');
            if (token) {
                api.setToken(token);
                setTarget('/(main)');
            } else {
                setTarget('/(auth)/login');
            }
        })();
    }, []);

    if (!target) return null;
    return <Redirect href={target} />;
}
