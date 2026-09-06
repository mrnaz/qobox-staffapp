import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';

const { width } = Dimensions.get('window');
const CARD_MARGIN = 16;
const GRID_WIDTH = width - CARD_MARGIN * 2;

// Shared month-grid view (day-of-week header + 6x7 date cells) used by both
// the Attendance and Calendar pages, so the two always look identical.
// Callers own everything inside a cell beyond the date number itself via
// renderCellExtra, and can add cell-level highlighting via getCellStyle.
const CalendarGrid = ({
    theme,
    dayLabels,
    calendarGrid,
    displayDate,
    isCurrentMonth,
    isToday,
    onDatePress,
    getCellStyle,
    renderCellExtra,
}) => {
    return (
        <>
            {/* Day Labels */}
            <View style={[styles.dayLabelsRow, { borderBottomColor: theme.colors.border }]}>
                {dayLabels.map((day, index) => (
                    <View
                        key={index}
                        style={[
                            styles.dayLabel,
                            index < dayLabels.length - 1 && {
                                borderRightWidth: 1,
                                borderRightColor: theme.colors.border,
                            },
                        ]}
                    >
                        <Text style={[styles.dayLabelText, { color: theme.colors.textSecondary }]}>
                            {day}
                        </Text>
                    </View>
                ))}
            </View>

            {/* Calendar Grid */}
            <View style={styles.calendarGrid}>
                {calendarGrid.map((date, index) => {
                    const isCurrentMonthDate = isCurrentMonth(date, displayDate);
                    const isTodayDate = isToday(date);
                    const cellInfo = { isCurrentMonthDate, isTodayDate };
                    const columnsCount = dayLabels.length;
                    const rowsCount = Math.ceil(calendarGrid.length / columnsCount);
                    const isLastColumn = index % columnsCount === columnsCount - 1;
                    const isLastRow = Math.floor(index / columnsCount) === rowsCount - 1;

                    return (
                        <TouchableOpacity
                            key={index}
                            style={[
                                styles.calendarCell,
                                { borderColor: theme.colors.border },
                                !isLastColumn && styles.calendarCellBorderRight,
                                !isLastRow && styles.calendarCellBorderBottom,
                                isTodayDate && { backgroundColor: theme.colors.primary + '20' },
                                getCellStyle && getCellStyle(date, cellInfo),
                            ]}
                            onPress={() => onDatePress(date)}
                        >
                            <View style={[styles.cellContent, !isCurrentMonthDate && styles.cellContentDimmed]}>
                                <Text
                                    style={[
                                        styles.dateText,
                                        { color: theme.colors.textPrimary },
                                        isTodayDate && styles.dateTextToday,
                                        !isCurrentMonthDate && styles.dateTextOtherMonth,
                                    ]}
                                >
                                    {date.getDate()}
                                </Text>

                                {renderCellExtra && renderCellExtra(date, cellInfo)}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </>
    );
};

const styles = StyleSheet.create({
    dayLabelsRow: {
        flexDirection: 'row',
        borderBottomWidth: 1,
    },
    dayLabel: {
        width: '14.2857%', // matches calendarCell's width basis exactly, so the
                           // header's vertical dividers line up with the grid's
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayLabelText: {
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
    },
    calendarGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    calendarCell: {
        flexGrow: 1,
        width: '14.2857%', // 1/7 of the row — percentage-based so it always matches the actual
                           // rendered container width (screen width minus card margin/border)
        height: Math.round(GRID_WIDTH / 7 * 1.25),
        padding: 4,
        position: 'relative',
    },
    calendarCellBorderRight: {
        borderRightWidth: 1,
    },
    calendarCellBorderBottom: {
        borderBottomWidth: 1,
    },
    cellContent: {
        flex: 1,
        flexDirection: 'column',
        justifyContent: 'space-between',
    },
    cellContentDimmed: {
        opacity: 0.3,
    },
    dateText: {
        fontSize: 16,
        marginBottom: 4,
    },
    dateTextToday: {
        fontWeight: 'bold',
    },
    dateTextOtherMonth: {
        fontSize: 12,
    },
});

export default CalendarGrid;
