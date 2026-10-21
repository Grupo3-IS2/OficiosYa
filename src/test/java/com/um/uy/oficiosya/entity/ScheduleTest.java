package com.um.uy.oficiosya.entity;

import com.um.uy.oficiosya.dto.request.ScheduleCreateRequest;
import com.um.uy.oficiosya.dto.response.ScheduleResponse;
import com.um.uy.oficiosya.dto.update.ScheduleUpdateRequest;
import com.um.uy.oficiosya.mapper.ScheduleMapper;
import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ScheduleTest {

    private static final OffsetDateTime BASE_START = OffsetDateTime.of(2030, 6, 3, 9, 0, 0, 0, ZoneOffset.UTC); // Monday
    private static final OffsetDateTime BASE_END = OffsetDateTime.of(2030, 6, 3, 11, 0, 0, 0, ZoneOffset.UTC);

    private Schedule createSchedule(String rrule, String tzid) {
        Schedule schedule = Schedule.builder()
                .id(1L)
                .type(ScheduleType.URGENT_AVAILABLE)
                .startTimestamp(BASE_START)
                .endTimestamp(BASE_END)
                .rrule(rrule)
                .tzid(tzid)
                .build();
        schedule.validateAndNormalizeRecurrence();
        return schedule;
    }

    // --- ByDayEntry & RecurrenceRule validation ---

    @Test
    void byDayEntry_validatesOrdinalRange() {
        assertDoesNotThrow(() -> new Schedule.ByDayEntry(null, DayOfWeek.MONDAY));
        assertDoesNotThrow(() -> new Schedule.ByDayEntry(1, DayOfWeek.MONDAY));
        assertDoesNotThrow(() -> new Schedule.ByDayEntry(-53, DayOfWeek.SUNDAY));
        assertDoesNotThrow(() -> new Schedule.ByDayEntry(53, DayOfWeek.SUNDAY));

        assertThrows(NullPointerException.class, () -> new Schedule.ByDayEntry(1, null));
        assertThrows(IllegalArgumentException.class, () -> new Schedule.ByDayEntry(0, DayOfWeek.MONDAY));
        assertThrows(IllegalArgumentException.class, () -> new Schedule.ByDayEntry(54, DayOfWeek.MONDAY));
        assertThrows(IllegalArgumentException.class, () -> new Schedule.ByDayEntry(-54, DayOfWeek.MONDAY));
    }

    // --- parseRRule validation & normalization ---

    @Test
    void parseRRule_rejectsBlankOrEmptyRules() {
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule(null, ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("   ", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("RRULE:", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("RRULE:   ", ZoneOffset.UTC));
    }

    @Test
    void parseRRule_rejectsMalformedTokensAndDuplicates() {
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("INVALID_TOKEN", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("=VAL", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("KEY=", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=DAILY;FREQ=WEEKLY", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("INTERVAL=2", ZoneOffset.UTC)); // missing FREQ
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=HOURLY", ZoneOffset.UTC)); // unsupported FREQ
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=DAILY;UNKNOWN_PROP=1", ZoneOffset.UTC));
    }

    @Test
    void parseRRule_validatesIntervalAndCount() {
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=DAILY;INTERVAL=abc", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=DAILY;INTERVAL=0", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=DAILY;INTERVAL=-1", ZoneOffset.UTC));

        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=DAILY;COUNT=xyz", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=DAILY;COUNT=0", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=DAILY;COUNT=1000", ZoneOffset.UTC)); // > 730

        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule(
                "FREQ=DAILY;COUNT=5;UNTIL=20301231T235959Z", ZoneOffset.UTC)); // COUNT and UNTIL mutually exclusive
    }

    @Test
    void parseRRule_untilFormats() {
        Schedule.RecurrenceRule r1 = Schedule.parseRRule("FREQ=DAILY;UNTIL=20301231T235959Z", ZoneOffset.UTC);
        assertNotNull(r1.until());

        Schedule.RecurrenceRule r2 = Schedule.parseRRule("FREQ=DAILY;UNTIL=20301231", ZoneOffset.UTC);
        assertNotNull(r2.until());

        Schedule.RecurrenceRule r3 = Schedule.parseRRule("FREQ=DAILY;UNTIL=20301231T235959", ZoneOffset.UTC);
        assertNotNull(r3.until());

        Schedule.RecurrenceRule r4 = Schedule.parseRRule("FREQ=DAILY;UNTIL=2030-12-31T23:59:59Z", ZoneOffset.UTC);
        assertNotNull(r4.until());

        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=DAILY;UNTIL=invalid_date", ZoneOffset.UTC));
    }

    @Test
    void parseRRule_byDayValidation() {
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=DAILY;BYDAY=", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=DAILY;BYDAY=INVALID", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=WEEKLY;BYDAY=1MO", ZoneOffset.UTC)); // ordinal not allowed for WEEKLY
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=DAILY;BYDAY=2TU", ZoneOffset.UTC)); // ordinal not allowed for DAILY

        Schedule.RecurrenceRule rMonthly = Schedule.parseRRule("FREQ=MONTHLY;BYDAY=1MO,-1FR", ZoneOffset.UTC);
        assertEquals(2, rMonthly.byDay().size());
        assertEquals(1, rMonthly.byDay().get(0).ordinal());
        assertEquals(DayOfWeek.MONDAY, rMonthly.byDay().get(0).dayOfWeek());
        assertEquals(-1, rMonthly.byDay().get(1).ordinal());
        assertEquals(DayOfWeek.FRIDAY, rMonthly.byDay().get(1).dayOfWeek());

        // Parse all 7 days of the week
        Schedule.RecurrenceRule allDays = Schedule.parseRRule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU", ZoneOffset.UTC);
        assertEquals(7, allDays.byDay().size());
        assertTrue(allDays.toNormalizedString().contains("BYDAY=MO,TU,WE,TH,FR,SA,SU"));
    }

    @Test
    void parseRRule_byMonthDayValidation() {
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=WEEKLY;BYMONTHDAY=15", ZoneOffset.UTC)); // not allowed on WEEKLY
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=MONTHLY;BYMONTHDAY=", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=MONTHLY;BYMONTHDAY=abc", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=MONTHLY;BYMONTHDAY=0", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=MONTHLY;BYMONTHDAY=32", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=MONTHLY;BYMONTHDAY=-32", ZoneOffset.UTC));

        Schedule.RecurrenceRule r = Schedule.parseRRule("FREQ=MONTHLY;BYMONTHDAY=1,15,-1", ZoneOffset.UTC);
        assertEquals(List.of(1, 15, -1), r.byMonthDay());
    }

    @Test
    void parseRRule_byMonthAndWkstValidation() {
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=YEARLY;BYMONTH=", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=YEARLY;BYMONTH=abc", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=YEARLY;BYMONTH=0", ZoneOffset.UTC));
        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=YEARLY;BYMONTH=13", ZoneOffset.UTC));

        Schedule.RecurrenceRule r = Schedule.parseRRule("FREQ=YEARLY;BYMONTH=1,6,12;WKST=SU", ZoneOffset.UTC);
        assertEquals(List.of(1, 6, 12), r.byMonth());
        assertEquals(DayOfWeek.SUNDAY, r.wkst());

        assertThrows(IllegalArgumentException.class, () -> Schedule.parseRRule("FREQ=WEEKLY;WKST=INVALID", ZoneOffset.UTC));

        // Test WKST for each day
        for (String day : List.of("MO", "TU", "WE", "TH", "FR", "SA", "SU")) {
            Schedule.RecurrenceRule wkstRule = Schedule.parseRRule("FREQ=WEEKLY;WKST=" + day, ZoneOffset.UTC);
            assertNotNull(wkstRule.wkst());
        }
    }

    @Test
    void recurrenceRule_toNormalizedString_coversAllOptions() {
        Schedule.RecurrenceRule rule = new Schedule.RecurrenceRule(
                Schedule.Frequency.YEARLY,
                2,
                10,
                null,
                List.of(new Schedule.ByDayEntry(1, DayOfWeek.MONDAY)),
                List.of(15),
                List.of(6),
                DayOfWeek.SUNDAY
        );
        assertEquals("FREQ=YEARLY;INTERVAL=2;COUNT=10;BYMONTH=6;BYMONTHDAY=15;BYDAY=1MO;WKST=SU", rule.toNormalizedString());
    }

    // --- resolveZoneId & validateAndNormalizeRecurrence ---

    @Test
    void resolveZoneId_andTzidValidation() {
        Schedule sValid = Schedule.builder().tzid("America/Montevideo").build();
        assertEquals("America/Montevideo", sValid.resolveZoneId().getId());

        Schedule sInvalid = Schedule.builder().tzid("Invalid/Zone").build();
        assertThrows(IllegalArgumentException.class, sInvalid::resolveZoneId);
        assertThrows(IllegalArgumentException.class, sInvalid::validateAndNormalizeRecurrence);

        Schedule sFallbackStart = Schedule.builder().startTimestamp(BASE_START).build();
        assertEquals(ZoneOffset.UTC, sFallbackStart.resolveZoneId());

        Schedule sEmpty = new Schedule();
        assertEquals(ZoneOffset.UTC, sEmpty.resolveZoneId());

        Schedule sTrim = Schedule.builder().tzid("   ").rrule("   ").build();
        sTrim.validateAndNormalizeRecurrence();
        assertNull(sTrim.getTzid());
        assertNull(sTrim.getRrule());
    }

    @Test
    void recalculateRecurrenceEnd_handlesInvalidTimestampsAndUnbounded() {
        Schedule sInverted = Schedule.builder().startTimestamp(BASE_END).endTimestamp(BASE_START).build();
        sInverted.validateAndNormalizeRecurrence();
        assertEquals(BASE_START, sInverted.getRecurrenceEnd());

        Schedule sUnbounded = createSchedule("FREQ=WEEKLY", "UTC");
        assertNull(sUnbounded.getRecurrenceEnd());

        Schedule sUntilPast = Schedule.builder()
                .startTimestamp(BASE_START)
                .endTimestamp(BASE_END)
                .rrule("FREQ=DAILY;UNTIL=20200101T000000Z")
                .build();
        sUntilPast.validateAndNormalizeRecurrence();
        assertEquals(BASE_END, sUntilPast.getRecurrenceEnd());
    }

    // --- Occurrence Expansion (Daily, Weekly, Monthly, Yearly) ---

    @Test
    void expandOccurrences_invalidIntervalsOrWindow() {
        Schedule sInverted = Schedule.builder().startTimestamp(BASE_END).endTimestamp(BASE_START).build();
        assertTrue(sInverted.expandOccurrences(null, null).isEmpty());

        Schedule s = createSchedule(null, null);
        assertTrue(s.expandOccurrences(BASE_END, BASE_START).isEmpty());
    }

    @Test
    void expandOccurrences_nonRecurringBehavior() {
        Schedule s = createSchedule(null, null);

        // Outside window before or after
        assertTrue(s.expandOccurrences(BASE_END.plusHours(1), BASE_END.plusHours(2)).isEmpty());
        assertTrue(s.expandOccurrences(BASE_START.minusHours(2), BASE_START.minusHours(1)).isEmpty());

        // Overlapping window
        List<Schedule.Occurrence> occs = s.expandOccurrences(BASE_START.minusHours(1), BASE_END.plusHours(1));
        assertEquals(1, occs.size());

        // Excluded via exdate
        s.addExdate(BASE_START);
        assertTrue(s.expandOccurrences(null, null).isEmpty());
    }

    @Test
    void expandOccurrences_dailyWithIntervalAndFilters() {
        Schedule s = createSchedule("FREQ=DAILY;INTERVAL=2;COUNT=3", "UTC");
        List<Schedule.Occurrence> occs = s.expandOccurrences(null, null);
        assertEquals(3, occs.size());
        assertEquals(BASE_START, occs.get(0).startTimestamp());
        assertEquals(BASE_START.plusDays(2), occs.get(1).startTimestamp());
        assertEquals(BASE_START.plusDays(4), occs.get(2).startTimestamp());

        Schedule sFiltered = createSchedule("FREQ=DAILY;COUNT=10;BYMONTHDAY=3,5", "UTC");
        List<Schedule.Occurrence> filteredOccs = sFiltered.expandOccurrences(null, null);
        assertEquals(10, filteredOccs.size());
    }

    @Test
    void expandOccurrences_weeklyWithByDayAndWkst() {
        Schedule s = createSchedule("FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR;COUNT=6", "UTC");
        List<Schedule.Occurrence> occs = s.expandOccurrences(null, null);
        assertEquals(6, occs.size());
        assertEquals(DayOfWeek.MONDAY, occs.get(0).startTimestamp().getDayOfWeek());
        assertEquals(DayOfWeek.WEDNESDAY, occs.get(1).startTimestamp().getDayOfWeek());
        assertEquals(DayOfWeek.FRIDAY, occs.get(2).startTimestamp().getDayOfWeek());
        assertEquals(DayOfWeek.MONDAY, occs.get(3).startTimestamp().getDayOfWeek());

        // Weekly with interval > 1
        Schedule sBiweekly = createSchedule("FREQ=WEEKLY;INTERVAL=2;COUNT=2", "UTC");
        List<Schedule.Occurrence> biweeklyOccs = sBiweekly.expandOccurrences(null, null);
        assertEquals(2, biweeklyOccs.size());
        assertEquals(BASE_START.plusWeeks(2), biweeklyOccs.get(1).startTimestamp());
    }

    @Test
    void expandOccurrences_monthlyByMonthDayNegativeAndByDay() {
        // Last day of month
        Schedule s = createSchedule("FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3", "UTC");
        List<Schedule.Occurrence> occs = s.expandOccurrences(null, null);
        assertEquals(3, occs.size());
        assertEquals(30, occs.get(0).startTimestamp().getDayOfMonth()); // June has 30 days
        assertEquals(31, occs.get(1).startTimestamp().getDayOfMonth()); // July has 31 days
        assertEquals(31, occs.get(2).startTimestamp().getDayOfMonth()); // August has 31 days

        // Monthly with BYDAY without ordinal
        Schedule sAllMondays = createSchedule("FREQ=MONTHLY;BYDAY=MO;COUNT=5", "UTC");
        List<Schedule.Occurrence> mondaysOccs = sAllMondays.expandOccurrences(null, null);
        assertEquals(5, mondaysOccs.size());
        assertTrue(mondaysOccs.stream().allMatch(o -> o.startTimestamp().getDayOfWeek() == DayOfWeek.MONDAY));

        // Monthly with interval 2
        Schedule sBiMonthly = createSchedule("FREQ=MONTHLY;INTERVAL=2;COUNT=2", "UTC");
        List<Schedule.Occurrence> bimonthlyOccs = sBiMonthly.expandOccurrences(null, null);
        assertEquals(2, bimonthlyOccs.size());
        assertEquals(8, bimonthlyOccs.get(1).startTimestamp().getMonthValue()); // June -> August
    }

    @Test
    void expandOccurrences_yearlyVariations() {
        // Yearly default (same month and day)
        Schedule sYearlyDefault = createSchedule("FREQ=YEARLY;COUNT=3", "UTC");
        List<Schedule.Occurrence> occsDefault = sYearlyDefault.expandOccurrences(null, null);
        assertEquals(3, occsDefault.size());
        assertEquals(2030, occsDefault.get(0).startTimestamp().getYear());
        assertEquals(2031, occsDefault.get(1).startTimestamp().getYear());
        assertEquals(2032, occsDefault.get(2).startTimestamp().getYear());

        // Yearly with BYMONTH and BYDAY
        Schedule s = createSchedule("FREQ=YEARLY;BYMONTH=6;BYDAY=1MO;COUNT=2", "UTC");
        List<Schedule.Occurrence> occs = s.expandOccurrences(null, null);
        assertEquals(2, occs.size());
        assertEquals(2030, occs.get(0).startTimestamp().getYear());
        assertEquals(2031, occs.get(1).startTimestamp().getYear());
        assertEquals(DayOfWeek.MONDAY, occs.get(1).startTimestamp().getDayOfWeek());

        // Yearly with BYMONTHDAY
        Schedule sYearlyMonthDay = createSchedule("FREQ=YEARLY;BYMONTH=6;BYMONTHDAY=15;COUNT=2", "UTC");
        List<Schedule.Occurrence> occsMday = sYearlyMonthDay.expandOccurrences(null, null);
        assertEquals(2, occsMday.size());
        assertEquals(15, occsMday.get(0).startTimestamp().getDayOfMonth());

        // Yearly with negative ordinal
        Schedule sYearlyNegative = createSchedule("FREQ=YEARLY;BYMONTH=6;BYDAY=-1FR;COUNT=2", "UTC");
        List<Schedule.Occurrence> occsNeg = sYearlyNegative.expandOccurrences(null, null);
        assertEquals(2, occsNeg.size());
        assertEquals(DayOfWeek.FRIDAY, occsNeg.get(0).startTimestamp().getDayOfWeek());

        // Yearly with interval 2
        Schedule sYearlyInterval = createSchedule("FREQ=YEARLY;INTERVAL=2;COUNT=2", "UTC");
        List<Schedule.Occurrence> occsInterval = sYearlyInterval.expandOccurrences(null, null);
        assertEquals(2032, occsInterval.get(1).startTimestamp().getYear());
    }

    // --- Overlaps ---

    @Test
    void overlaps_intervalEdgeCases() {
        Schedule s = createSchedule(null, null);
        assertFalse(s.overlaps(null, BASE_END));
        assertFalse(s.overlaps(BASE_START, null));
        assertFalse(s.overlaps(BASE_END, BASE_START));
        assertFalse(s.overlaps(BASE_END.plusHours(1), BASE_END.plusHours(2)));
        assertFalse(s.overlaps(BASE_START.minusHours(2), BASE_START.minusHours(1)));
        assertTrue(s.overlaps(BASE_START.plusMinutes(30), BASE_END.plusMinutes(30)));
    }

    @Test
    void overlaps_otherScheduleEdgeCases() {
        Schedule s = createSchedule(null, null);
        assertFalse(s.overlaps((Schedule) null));

        Schedule otherNullTs = new Schedule();
        assertFalse(s.overlaps(otherNullTs));

        Schedule sOther = Schedule.builder()
                .startTimestamp(BASE_START.plusDays(10))
                .endTimestamp(BASE_END.plusDays(10))
                .build();
        assertFalse(s.overlaps(sOther));

        // Both excluded by exdate
        s.addExdate(BASE_START);
        assertFalse(s.overlaps(s));

        // Recurring with one unbounded and one bounded
        Schedule sUnbounded = createSchedule("FREQ=DAILY", "UTC");
        Schedule sBounded = createSchedule("FREQ=DAILY;COUNT=3", "UTC");
        assertTrue(sUnbounded.overlaps(sBounded));
        assertTrue(sBounded.overlaps(sUnbounded));

        // Bounded recurring vs disjoint interval
        Schedule sDisjoint = Schedule.builder()
                .startTimestamp(BASE_START.plusYears(5))
                .endTimestamp(BASE_END.plusYears(5))
                .build();
        assertFalse(sBounded.overlaps(sDisjoint));
    }

    // --- EXDATE & iCalendar Parsing / Serialization ---

    @Test
    void exdate_nullAndInstantHandling() {
        Schedule s = new Schedule();
        assertThrows(IllegalArgumentException.class, () -> s.addExdate(null));
        assertFalse(s.removeExdate(null));
        assertFalse(s.removeExdate(BASE_START));

        s.addExdate(BASE_START);
        // Adding same instant with different offset
        s.addExdate(BASE_START.withOffsetSameInstant(ZoneOffset.ofHours(-3)));
        assertEquals(1, s.getExdates().size());

        assertTrue(s.removeExdate(BASE_START.withOffsetSameInstant(ZoneOffset.ofHours(2))));
        assertEquals(0, s.getExdates().size());
    }

    @Test
    void iCalendar_blankAndMalformedHandling() {
        Schedule s = new Schedule();
        assertThrows(IllegalArgumentException.class, () -> s.applyICalendarVEvent(null));
        assertThrows(IllegalArgumentException.class, () -> s.applyICalendarVEvent("   "));
        assertThrows(IllegalArgumentException.class, () -> s.applyICalendarVEvent("BEGIN:VEVENT\r\nEND:VEVENT")); // missing DTSTART / DTEND
        assertThrows(IllegalArgumentException.class, () -> s.applyICalendarVEvent("DTSTART;TZID=Invalid/Tz:20300101T100000\r\nDTEND:20300101T120000Z"));

        String ics = """
                BEGIN:VCALENDAR
                VERSION:2.0
                BEGIN:VEVENT
                SUMMARY:UNKNOWN_CUSTOM_SUMMARY
                DTSTART;TZID=UTC:20300603T090000
                DTEND;TZID=UTC:20300603T110000
                EXDATE:20300604T090000Z,20300605T090000Z
                RRULE:FREQ=DAILY;COUNT=5
                END:VEVENT
                END:VCALENDAR
                """;
        s.applyICalendarVEvent(ics);
        assertEquals(Schedule.Frequency.DAILY, Schedule.parseRRule(s.getRrule(), ZoneOffset.UTC).freq());
        assertEquals(2, s.getExdates().size());
        assertEquals("UTC", s.getTzid());
    }

    @Test
    void toICalendarVEvent_withoutIdAndWithoutTzid() {
        Schedule sNoIdNoTz = Schedule.builder()
                .type(ScheduleType.USER_RESERVED)
                .startTimestamp(BASE_START)
                .endTimestamp(BASE_END)
                .build();
        String ics = sNoIdNoTz.toICalendarVEvent();
        assertTrue(ics.contains("UID:schedule-temp@oficiosya.uy"));
        assertTrue(ics.contains("DTSTART:20300603T090000Z"));
        assertTrue(ics.contains("DTEND:20300603T110000Z"));
        assertTrue(ics.contains("SUMMARY:USER_RESERVED"));
    }

    // --- DTOs and Mappers Coverage ---

    @Test
    void dtoAndMapperCoverage() {
        UUID profId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        ScheduleResponse response = new ScheduleResponse(1L, profId, 2L, ScheduleType.SCHEDULED_JOB, now, now.plusHours(1));
        assertEquals(1L, response.getId());
        assertEquals(profId, response.getProfessionalId());
        assertEquals(2L, response.getJobRequestId());
        assertEquals(ScheduleType.SCHEDULED_JOB, response.getType());

        ScheduleResponse fullResponse = new ScheduleResponse(
                1L, profId, 2L, ScheduleType.SCHEDULED_JOB, now, now.plusHours(1),
                "FREQ=DAILY", "UTC", List.of(), now.plusDays(5));
        assertEquals("FREQ=DAILY", fullResponse.getRrule());
        assertEquals("UTC", fullResponse.getTzid());
        assertNotNull(fullResponse.getRecurrenceEnd());
        assertNotNull(fullResponse.toString());
        assertEquals(fullResponse, new ScheduleResponse(1L, profId, 2L, ScheduleType.SCHEDULED_JOB, now, now.plusHours(1), "FREQ=DAILY", "UTC", List.of(), now.plusDays(5)));
        assertNotEquals(fullResponse, response);

        ScheduleCreateRequest create = new ScheduleCreateRequest();
        create.setType(ScheduleType.URGENT_AVAILABLE);
        create.setStartTimestamp(now);
        create.setEndTimestamp(now.plusHours(2));
        create.setRrule("FREQ=WEEKLY");
        create.setTzid("America/Montevideo");
        create.setExdates(List.of(now.plusDays(7)));
        assertEquals("FREQ=WEEKLY", create.getRrule());
        assertNotNull(create.toString());

        ScheduleUpdateRequest update = new ScheduleUpdateRequest();
        update.setStartTimestamp(now);
        update.setEndTimestamp(now.plusHours(2));
        update.setRrule("FREQ=WEEKLY");
        update.setTzid("America/Montevideo");
        update.setExdates(List.of(now.plusDays(7)));
        assertEquals("America/Montevideo", update.getTzid());
        assertNotNull(update.toString());

        ScheduleMapper mapper = new ScheduleMapper() {
            @Override
            public Schedule toEntity(ScheduleCreateRequest dto) { return null; }
            @Override
            public ScheduleResponse toResponse(Schedule schedule) { return new ScheduleResponse(); }
        };
        ScheduleResponse nullOccResponse = mapper.toOccurrenceResponse(new Schedule(), null);
        assertNotNull(nullOccResponse);
    }
}
