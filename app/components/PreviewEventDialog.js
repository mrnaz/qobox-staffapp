import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    StyleSheet,
    Modal,
    Dimensions,
} from 'react-native';
import moment from 'moment';
import Theme from '../context/ThemeContext';
import api from '../services/api';

const { width, height } = Dimensions.get('window');

const PreviewEventDialog = ({ 
    isVisible, 
    event, 
    calendarEventTypes, 
    onClose 
}) => {
    const { ThemeProvider, useTheme } = Theme; 
    const { theme } = useTheme();
    const [siteInfo, setSiteInfo] = useState('Loading...');
    const [locationInfo, setLocationInfo] = useState('Loading...');

    useEffect(() => {
        if (isVisible && event) {
            fetchSiteInfo();
            fetchLocationInfo();
        }
    }, [isVisible, event]);

    const fetchSiteInfo = async () => {
        if (event?.location_site) {
            try {
                // This would need to be implemented in your API
                // For now, we'll use placeholder data
                setSiteInfo('Main Campus - Building A - Room 101');
            } catch (error) {
                console.error('Error fetching site information:', error);
                setSiteInfo('Error fetching site information');
            }
        } else {
            setSiteInfo('No site selected');
        }
    };

    const fetchLocationInfo = async () => {
        if (event?.location_site) {
            try {
                // This would need to be implemented in your API
                // For now, we'll use placeholder data
                setLocationInfo('Main Campus - Building A - Room 101');
            } catch (error) {
                console.error('Error fetching location information:', error);
                setLocationInfo('Error fetching location information');
            }
        } else if (event?.location_building) {
            setLocationInfo('Building A - Room 101');
        } else if (event?.location_room) {
            setLocationInfo('Room 101');
        } else {
            setLocationInfo('No location specified');
        }
    };

    const getEventTypeName = (eventTypeId) => {
        const eventType = calendarEventTypes.find(type => type.id === eventTypeId);
        return eventType
            ? { label: eventType.label, color: eventType.color }
            : { label: '', color: '' };
    };

    const getRepeatInfo = () => {
        if (!event?.repeating || event.repeating === 'N') return 'No repeat';
        const frequency = getFrequencyLabel(event.repeating);
        const count = event.repeat_count > 1 ? `${event.repeat_count} times` : 'once';
        return `Repeats every ${event.repeat_mult} ${frequency}, ${count}`;
    };

    const getFrequencyLabel = (frequency) => {
        const labels = { H: 'Hour(s)', D: 'Day(s)', W: 'Week(s)', M: 'Month(s)', Y: 'Year(s)' };
        return labels[frequency] || '';
    };

    const getMemberResponse = (response) => {
        const responses = { A: 'Accepted', D: 'Declined', P: 'Pending', T: 'Tentative' };
        return responses[response] || 'Unknown';
    };

    const getMemberResponseColor = (response) => {
        const responseColors = {
            A: theme.colors.success,
            D: theme.colors.error,
            P: theme.colors.info,
            T: theme.colors.warning,
        };
        return responseColors[response] || theme.colors.textSecondary;
    };

    if (!event) return null;

    return (
        <Modal
            visible={isVisible}
            transparent={true}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={[styles.modalOverlay, { backgroundColor: theme.colors.overlay }]}>
                <View style={[styles.modalContent, { backgroundColor: theme.colors.cardBackground }]}>
                    {/* Header */}
                    <View style={[styles.header, { borderBottomColor: theme.colors.border }]}>
                        <Text style={[styles.title, { color: theme.colors.textPrimary }]}>
                            {event.title || 'Preview Event'}
                        </Text>
                        <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                            <Text style={[styles.closeButtonText, { color: theme.colors.textSecondary }]}>
                                ✕
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Content */}
                    <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                        <View style={styles.row}>
                            {/* Left Column */}
                            <View style={styles.column}>
                                <View style={styles.infoItem}>
                                    <View style={styles.infoHeader}>
                                        <Text style={styles.infoIcon}>📅</Text>
                                        <Text style={[styles.infoTitle, { color: theme.colors.textPrimary }]}>
                                            All Day Event
                                        </Text>
                                    </View>
                                    <Text style={[styles.infoValue, { color: theme.colors.textSecondary }]}>
                                        {event.all_day ? 'Yes' : 'No'}
                                    </Text>
                                </View>

                                <View style={styles.infoItem}>
                                    <View style={styles.infoHeader}>
                                        <Text style={styles.infoIcon}>🕐</Text>
                                        <Text style={[styles.infoTitle, { color: theme.colors.textPrimary }]}>
                                            Start Time
                                        </Text>
                                    </View>
                                    <Text style={[styles.infoValue, { color: theme.colors.textSecondary }]}>
                                        {moment(event.start_at).format('DD/MM/YYYY @ HH:mm')}
                                    </Text>
                                </View>

                                {!event.all_day && event.end_at && (
                                    <View style={styles.infoItem}>
                                        <View style={styles.infoHeader}>
                                            <Text style={styles.infoIcon}>🕐</Text>
                                            <Text style={[styles.infoTitle, { color: theme.colors.textPrimary }]}>
                                                End Time
                                            </Text>
                                        </View>
                                        <Text style={[styles.infoValue, { color: theme.colors.textSecondary }]}>
                                            {moment(event.end_at).format('DD/MM/YYYY @ HH:mm')}
                                        </Text>
                                    </View>
                                )}

                                {event.description && (
                                    <View style={styles.infoItem}>
                                        <View style={styles.infoHeader}>
                                            <Text style={styles.infoIcon}>📝</Text>
                                            <Text style={[styles.infoTitle, { color: theme.colors.textPrimary }]}>
                                                Description
                                            </Text>
                                        </View>
                                        <Text style={[styles.infoValue, { color: theme.colors.textSecondary }]}>
                                            {event.description}
                                        </Text>
                                    </View>
                                )}
                                
                                {event?.event_type && (
                                    <View style={styles.infoItem}>
                                        <View style={styles.infoHeader}>
                                            <Text style={styles.infoIcon}>📅</Text>
                                            <Text style={[styles.infoTitle, { color: theme.colors.textPrimary }]}>
                                                Event Type
                                            </Text>
                                        </View>
                                        <View style={[styles.eventTypeChip, { backgroundColor: theme.colors.info }]}>
                                            <Text style={[styles.eventTypeText, { color: theme.colors.onPrimary }]}>
                                                {getEventTypeName(event?.event_type).label}
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                {event.repeating && event.repeating !== 'N' && (
                                    <View style={styles.infoItem}>
                                        <View style={styles.infoHeader}>
                                            <Text style={styles.infoIcon}>🔄</Text>
                                            <Text style={[styles.infoTitle, { color: theme.colors.textPrimary }]}>
                                                Repeat
                                            </Text>
                                        </View>
                                        <Text style={[styles.infoValue, { color: theme.colors.textSecondary }]}>
                                            {getRepeatInfo()}
                                        </Text>
                                    </View>
                                )}

                                <View style={styles.infoItem}>
                                    <View style={styles.infoHeader}>
                                        <Text style={styles.infoIcon}>🏢</Text>
                                        <Text style={[styles.infoTitle, { color: theme.colors.textPrimary }]}>
                                            Location
                                        </Text>
                                    </View>
                                    <Text style={[styles.infoValue, { color: theme.colors.textSecondary }]}>
                                        {locationInfo}
                                    </Text>
                                </View>

                                {event.location_description && (
                                    <View style={styles.infoItem}>
                                        <View style={styles.infoHeader}>
                                            <Text style={styles.infoIcon}>📍</Text>
                                            <Text style={[styles.infoTitle, { color: theme.colors.textPrimary }]}>
                                                Location Description
                                            </Text>
                                        </View>
                                        <Text style={[styles.infoValue, { color: theme.colors.textSecondary }]}>
                                            {event.location_description}
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>

                        {/* Attendees Section */}
                        {event?.members && event.members.length > 0 && (
                            <View style={[styles.attendeesSection, { borderTopColor: theme.colors.divider }]}>
                                <View style={styles.infoHeader}>
                                    <Text style={styles.infoIcon}>👥</Text>
                                    <Text style={[styles.infoTitle, { color: theme.colors.textPrimary }]}>
                                        Attendees:
                                    </Text>
                                </View>
                                
                                <View style={styles.attendeesList}>
                                    {event.members.map((member, index) => (
                                        <View key={index} style={[styles.attendeeItem, { backgroundColor: theme.colors.pressedOverlay }]}>
                                            <View style={styles.attendeeInfo}>
                                                <View style={[styles.avatar, { backgroundColor: theme.colors.info }]}>
                                                    <Text style={[styles.avatarText, { color: theme.colors.onPrimary }]}>
                                                        {member.full_name?.charAt(0) || '?'}
                                                    </Text>
                                                </View>
                                                <Text style={[styles.attendeeName, { color: theme.colors.textPrimary }]}>
                                                    {member.full_name}
                                                </Text>
                                            </View>
                                            
                                            <View style={styles.attendeeDetails}>
                                                <View style={[
                                                    styles.responseChip,
                                                    { backgroundColor: getMemberResponseColor(member.response) }
                                                ]}>
                                                    <Text style={[styles.responseText, { color: theme.colors.onPrimary }]}>
                                                        {getMemberResponse(member.response)}
                                                    </Text>
                                                </View>
                                                
                                                <Text style={styles.attendeeType}>
                                                    {member.staff_id ? '👨‍🏫' : '👤'}
                                                </Text>
                                                
                                                {member.event_admin && (
                                                    <Text style={styles.adminIcon}>⭐</Text>
                                                )}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        )}
                    </ScrollView>

                    {/* Actions */}
                    <View style={[styles.actions, { borderTopColor: theme.colors.border }]}>
                        <TouchableOpacity
                            style={[styles.closeActionButton, { backgroundColor: theme.colors.background }]}
                            onPress={onClose}
                        >
                            <Text style={[styles.closeActionButtonText, { color: theme.colors.textSecondary }]}>
                                Close
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: height,
    },
    modalContent: {
        width: width * 0.9,
        maxHeight: height * 0.7,
        height: height,
        borderRadius: 12,
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
    },
    title: {
        fontSize: 20,
        fontWeight: '600',
        flex: 1,
    },
    closeButton: {
        padding: 8,
    },
    closeButtonText: {
        fontSize: 20,
        fontWeight: 'bold',
    },
    content: {
        flex: 1,
        padding: 20,
    },
    row: {
        flexDirection: 'row',
        gap: 20,
    },
    column: {
        flex: 1,
    },
    infoItem: {
        marginBottom: 20,
        width: '100%',
    },
    infoHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    infoIcon: {
        fontSize: 18,
        marginRight: 8,
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: '600',
    },
    infoValue: {
        fontSize: 14,
        marginLeft: 26,
        lineHeight: 20,
    },
    eventTypeChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        alignSelf: 'flex-start',
        marginLeft: 26,
    },
    eventTypeText: {
        fontSize: 12,
        fontWeight: '500',
    },
    attendeesSection: {
        marginTop: 20,
        paddingTop: 20,
        borderTopWidth: 1,
    },
    attendeesList: {
        marginTop: 12,
    },
    attendeeItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        marginBottom: 8,
    },
    attendeeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    avatar: {
        width: 34,
        height: 34,
        borderRadius: 17,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    avatarText: {
        fontSize: 16,
        fontWeight: '600',
    },
    attendeeName: {
        fontSize: 14,
        fontWeight: '500',
        flex: 1,
    },
    attendeeDetails: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    responseChip: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
    },
    responseText: {
        fontSize: 11,
        fontWeight: '500',
    },
    attendeeType: {
        fontSize: 16,
    },
    adminIcon: {
        fontSize: 16,
    },
    actions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        padding: 20,
        borderTopWidth: 1,
    },
    closeActionButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    closeActionButtonText: {
        fontSize: 16,
        fontWeight: '500',
    },
});

export default PreviewEventDialog; 