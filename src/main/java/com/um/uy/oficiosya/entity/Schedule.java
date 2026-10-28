package com.um.uy.oficiosya.entity;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.DateTimeException;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Entity
@Getter
@Setter
@Table(name = "schedule")
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Schedule {

    private static final int MAX_EXPANDED_OCCURRENCES = 730;
    private static final int DEFAULT_UNBOUNDED_OCCURRENCES = 366;
    private static final int MAX_CANDIDATE_DAYS = 3650;
    private static final Duration UNBOUNDED_OVERLAP_HORIZON = Duration.ofDays(730);

    private static final String RRULE_PREFIX = "RRULE:";
    private static final String PROP_RRULE = "RRULE";
    private static final String PROP_FREQ = "FREQ";
    private static final String PROP_INTERVAL = "INTERVAL";
    private static final String PROP_COUNT = "COUNT";
    private static final String PROP_UNTIL = "UNTIL";
    private static final String PROP_BYDAY = "BYDAY";
    private static final String PROP_BYMONTHDAY = "BYMONTHDAY";
    private static final String PROP_BYMONTH = "BYMONTH";
    private static final String PROP_WKST = "WKST";
    private static final String PROP_TZID = "TZID";
    private static final String PROP_DTSTART = "DTSTART";
    private static final String PROP_DTEND = "DTEND";
    private static final String PROP_EXDATE = "EXDATE";
    private static final String PROP_SUMMARY = "SUMMARY";

    private static final DateTimeFormatter ICAL_UTC_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'", Locale.ROOT).withZone(ZoneOffset.UTC);
    private static final DateTimeFormatter ICAL_LOCAL_DT_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss", Locale.ROOT);
    private static final DateTimeFormatter ICAL_DATE_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMdd", Locale.ROOT);
    private static final Pattern BYDAY_PATTERN =
            Pattern.compile("([+-]?\\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)");
    private static final Pattern ICAL_UNFOLD_PATTERN =
            Pattern.compile("\\r?\\n[ \\t]");
    private static final Pattern ICAL_LINE_BREAK_PATTERN =
            Pattern.compile("\\r?\\n");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "professional_id", nullable = false)
    private Professional professional;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_request_id")
    private JobRequest jobRequest;

    @NotNull
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ScheduleType type;

    @NotNull
    @Column(nullable = false)
    private OffsetDateTime startTimestamp;

    @NotNull
    @Column(nullable = false)
    private OffsetDateTime endTimestamp;

    /**
     * RFC 5545 Recurrence Rule (RRULE), e.g. {@code FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=10}.
     * Null when this schedule is a single, non-recurring block.
     */
    @Column(name = "rrule", length = 512)
    private String rrule;

    /**
     * RFC 5545 Time Zone Identifier (TZID), e.g. {@code America/Montevideo} or {@code -03:00}.
     * When null, recurrence calculations preserve the offset of {@link #startTimestamp}.
     */
    @Column(name = "tzid", length = 64)
    private String tzid;

    /**
     * RFC 5545 Exception Date-Times (EXDATE): occurrence start instants excluded from the recurrence set.
     */
    @Builder.Default
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "schedule_exdate", joinColumns = @JoinColumn(name = "schedule_id"))
    @Column(name = "exdate_timestamp", nullable = false)
    private List<OffsetDateTime> exdates = new ArrayList<>();

    /**
     * Precomputed upper bound of the last occurrence's end timestamp.
     * Equals {@link #endTimestamp} for non-recurring blocks, the end of the final occurrence when
     * {@code COUNT} or {@code UNTIL} is present, or {@code null} when the {@code RRULE} is unbounded.
     */
    @Column(name = "recurrence_end")
    private OffsetDateTime recurrenceEnd;

    public enum Frequency {
        DAILY,
        WEEKLY,
        MONTHLY,
        YEARLY
    }

    public record ByDayEntry(Integer ordinal, DayOfWeek dayOfWeek) {
        public ByDayEntry {
            Objects.requireNonNull(dayOfWeek, "dayOfWeek must not be null");
            if (Objects.nonNull(ordinal) && (Integer.valueOf(0).equals(ordinal) || ordinal < -53 || ordinal > 53)) {
                throw new IllegalArgumentException("Invalid BYDAY ordinal in RRULE: " + ordinal);
            }
        }
    }

    public record RecurrenceRule(
            Frequency freq,
            int interval,
            Integer count,
            OffsetDateTime until,
            List<ByDayEntry> byDay,
            List<Integer> byMonthDay,
            List<Integer> byMonth,
            DayOfWeek wkst
    ) {
        public RecurrenceRule {
            if (interval <= 0) {
                interval = 1;
            }
            if (Objects.isNull(byDay)) {
                byDay = List.of();
            }
            if (Objects.isNull(byMonthDay)) {
                byMonthDay = List.of();
            }
            if (Objects.isNull(byMonth)) {
                byMonth = List.of();
            }
            if (Objects.isNull(wkst)) {
                wkst = DayOfWeek.MONDAY;
            }
        }

        public static String toIcalDay(DayOfWeek dayOfWeek) {
            return switch (dayOfWeek) {
                case MONDAY -> "MO";
                case TUESDAY -> "TU";
                case WEDNESDAY -> "WE";
                case THURSDAY -> "TH";
                case FRIDAY -> "FR";
                case SATURDAY -> "SA";
                case SUNDAY -> "SU";
            };
        }

        public String toNormalizedString() {
            List<String> parts = new ArrayList<>();
            parts.add(PROP_FREQ + "=" + freq.name());
            if (interval > 1) {
                parts.add(PROP_INTERVAL + "=" + interval);
            }
            if (Objects.nonNull(count)) {
                parts.add(PROP_COUNT + "=" + count);
            }
            if (Objects.nonNull(until)) {
                parts.add(PROP_UNTIL + "=" + ICAL_UTC_FORMAT.format(until.toInstant()));
            }
            if (Objects.nonNull(byMonth) && !byMonth.isEmpty()) {
                parts.add(PROP_BYMONTH + "=" + byMonth.stream().map(String::valueOf).collect(Collectors.joining(",")));
            }
            if (Objects.nonNull(byMonthDay) && !byMonthDay.isEmpty()) {
                parts.add(PROP_BYMONTHDAY + "=" + byMonthDay.stream().map(String::valueOf).collect(Collectors.joining(",")));
            }
            if (Objects.nonNull(byDay) && !byDay.isEmpty()) {
                parts.add(PROP_BYDAY + "=" + byDay.stream()
                        .map(entry -> (Objects.nonNull(entry.ordinal()) ? entry.ordinal().toString() : "") + toIcalDay(entry.dayOfWeek()))
                        .collect(Collectors.joining(",")));
            }
            if (Objects.nonNull(wkst) && !DayOfWeek.MONDAY.equals(wkst)) {
                parts.add(PROP_WKST + "=" + toIcalDay(wkst));
            }
            return String.join(";", parts);
        }
    }

    public record Occurrence(OffsetDateTime startTimestamp, OffsetDateTime endTimestamp) {}

    public boolean isRecurring() {
        return Objects.nonNull(rrule) && !rrule.isBlank();
    }

    public ZoneId resolveZoneId() {
        if (Objects.nonNull(tzid) && !tzid.isBlank()) {
            try {
                return ZoneId.of(tzid.trim());
            } catch (DateTimeException ex) {
                throw new IllegalArgumentException("Invalid time zone identifier (TZID): " + tzid, ex);
            }
        }
        if (Objects.nonNull(startTimestamp)) {
            return startTimestamp.getOffset();
        }
        return ZoneOffset.UTC;
    }

    /**
     * Validates RFC 5545 fields ({@code rrule}, {@code tzid}, {@code exdates}) and updates {@link #recurrenceEnd}.
     */
    @PrePersist
    @PreUpdate
    public void validateAndNormalizeRecurrence() {
        if (Objects.isNull(exdates)) {
            exdates = new ArrayList<>();
        } else {
            List<OffsetDateTime> unique = deduplicateByInstant(exdates);
            // Same list when possible: on @PreUpdate it's Hibernate's, and a new one set while flushing is never saved
            if (unique.size() != exdates.size()) {
                try {
                    exdates.clear();
                    exdates.addAll(unique);
                } catch (UnsupportedOperationException immutable) {
                    exdates = unique;
                }
            }
        }

        if (Objects.nonNull(tzid)) {
            String trimmedTz = tzid.trim();
            if (trimmedTz.isEmpty()) {
                tzid = null;
            } else {
                try {
                    ZoneId.of(trimmedTz);
                    tzid = trimmedTz;
                } catch (DateTimeException ex) {
                    throw new IllegalArgumentException("Invalid time zone identifier (TZID): " + tzid, ex);
                }
            }
        }

        if (Objects.nonNull(rrule)) {
            String trimmedRule = rrule.trim();
            if (trimmedRule.isEmpty()) {
                rrule = null;
            } else {
                RecurrenceRule parsed = parseRRule(trimmedRule, resolveZoneId());
                rrule = parsed.toNormalizedString();
            }
        }

        recalculateRecurrenceEnd();
    }

    private void recalculateRecurrenceEnd() {
        if (Objects.isNull(startTimestamp) || Objects.isNull(endTimestamp) || !startTimestamp.isBefore(endTimestamp)) {
            recurrenceEnd = endTimestamp;
            return;
        }
        if (!isRecurring()) {
            recurrenceEnd = endTimestamp;
            return;
        }
        RecurrenceRule parsed = parseRRule(rrule, resolveZoneId());
        if (Objects.isNull(parsed.count()) && Objects.isNull(parsed.until())) {
            recurrenceEnd = null;
            return;
        }
        List<Occurrence> occurrences = generateOccurrencesInternal(parsed, null, null, false, MAX_EXPANDED_OCCURRENCES);
        if (occurrences.isEmpty()) {
            recurrenceEnd = endTimestamp;
        } else {
            recurrenceEnd = occurrences.get(occurrences.size() - 1).endTimestamp();
        }
    }

    /**
     * Parses and validates an RFC 5545 {@code RRULE} string.
     */
    public static RecurrenceRule parseRRule(String rawRRule, ZoneId defaultZone) {
        String cleaned = cleanRRuleString(rawRRule);
        Map<String, String> properties = parseProperties(cleaned);
        validateSupportedKeys(properties);

        Frequency freq = parseFrequency(properties);
        int interval = parseInterval(properties);
        Integer count = parseCount(properties);
        OffsetDateTime until = parseUntil(properties, defaultZone);
        validateCountAndUntil(count, until);

        List<ByDayEntry> byDay = parseByDayProperty(properties, freq);
        List<Integer> byMonthDay = parseByMonthDayProperty(properties, freq);
        List<Integer> byMonth = parseByMonthProperty(properties);
        DayOfWeek wkst = parseWkst(properties);

        return new RecurrenceRule(freq, interval, count, until, byDay, byMonthDay, byMonth, wkst);
    }

    private static String cleanRRuleString(String rawRRule) {
        if (Objects.isNull(rawRRule) || rawRRule.isBlank()) {
            throw new IllegalArgumentException("Recurrence rule (RRULE) must not be blank");
        }
        String cleaned = rawRRule.trim();
        if (cleaned.toUpperCase(Locale.ROOT).startsWith(RRULE_PREFIX)) {
            cleaned = cleaned.substring(RRULE_PREFIX.length()).trim();
        }
        if (cleaned.isEmpty()) {
            throw new IllegalArgumentException("Recurrence rule (RRULE) must not be blank");
        }
        return cleaned;
    }

    private static Map<String, String> parseProperties(String cleaned) {
        Map<String, String> properties = new LinkedHashMap<>();
        String[] tokens = cleaned.split(";");
        for (String token : tokens) {
            if (!token.isBlank()) {
                int eqIdx = token.indexOf('=');
                if (eqIdx <= 0 || Integer.valueOf(token.length() - 1).equals(eqIdx)) {
                    throw new IllegalArgumentException("Invalid property in RRULE: " + token);
                }
                String key = token.substring(0, eqIdx).trim().toUpperCase(Locale.ROOT);
                String value = token.substring(eqIdx + 1).trim().toUpperCase(Locale.ROOT);
                if (Objects.nonNull(properties.put(key, value))) {
                    throw new IllegalArgumentException("Duplicate property in RRULE: " + key);
                }
            }
        }
        return properties;
    }

    private static void validateSupportedKeys(Map<String, String> properties) {
        Set<String> supportedKeys = Set.of(
                PROP_FREQ, PROP_INTERVAL, PROP_COUNT, PROP_UNTIL,
                PROP_BYDAY, PROP_BYMONTHDAY, PROP_BYMONTH, PROP_WKST
        );
        for (String key : properties.keySet()) {
            if (!supportedKeys.contains(key)) {
                throw new IllegalArgumentException("Unsupported property in RRULE: " + key);
            }
        }
    }

    private static Frequency parseFrequency(Map<String, String> properties) {
        String freqStr = properties.get(PROP_FREQ);
        if (Objects.isNull(freqStr)) {
            throw new IllegalArgumentException("RRULE must specify FREQ (DAILY, WEEKLY, MONTHLY, or YEARLY)");
        }
        try {
            return Frequency.valueOf(freqStr);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unsupported frequency (FREQ) in RRULE: " + freqStr, ex);
        }
    }

    private static int parseInterval(Map<String, String> properties) {
        if (!properties.containsKey(PROP_INTERVAL)) {
            return 1;
        }
        try {
            int interval = Integer.parseInt(properties.get(PROP_INTERVAL));
            if (interval <= 0) {
                throw new IllegalArgumentException("INTERVAL must be greater than 0 in RRULE");
            }
            return interval;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("INTERVAL must be a positive integer in RRULE", ex);
        }
    }

    private static Integer parseCount(Map<String, String> properties) {
        if (!properties.containsKey(PROP_COUNT)) {
            return null;
        }
        try {
            int count = Integer.parseInt(properties.get(PROP_COUNT));
            if (count <= 0 || count > MAX_EXPANDED_OCCURRENCES) {
                throw new IllegalArgumentException("COUNT must be between 1 and " + MAX_EXPANDED_OCCURRENCES + " in RRULE");
            }
            return count;
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("COUNT must be a positive integer in RRULE", ex);
        }
    }

    private static OffsetDateTime parseUntil(Map<String, String> properties, ZoneId defaultZone) {
        if (!properties.containsKey(PROP_UNTIL)) {
            return null;
        }
        ZoneId zone = Objects.nonNull(defaultZone) ? defaultZone : ZoneOffset.UTC;
        return parseICalDateTime(properties.get(PROP_UNTIL), zone, true);
    }

    private static void validateCountAndUntil(Integer count, OffsetDateTime until) {
        if (Objects.nonNull(count) && Objects.nonNull(until)) {
            throw new IllegalArgumentException("RRULE must not contain both COUNT and UNTIL (RFC 5545)");
        }
    }

    private static List<ByDayEntry> parseByDayProperty(Map<String, String> properties, Frequency freq) {
        return properties.containsKey(PROP_BYDAY) ? parseByDay(properties.get(PROP_BYDAY), freq) : List.of();
    }

    private static List<Integer> parseByMonthDayProperty(Map<String, String> properties, Frequency freq) {
        return properties.containsKey(PROP_BYMONTHDAY) ? parseByMonthDay(properties.get(PROP_BYMONTHDAY), freq) : List.of();
    }

    private static List<Integer> parseByMonthProperty(Map<String, String> properties) {
        return properties.containsKey(PROP_BYMONTH) ? parseByMonth(properties.get(PROP_BYMONTH)) : List.of();
    }

    private static DayOfWeek parseWkst(Map<String, String> properties) {
        return properties.containsKey(PROP_WKST) ? parseIcalDay(properties.get(PROP_WKST)) : DayOfWeek.MONDAY;
    }

    /**
     * Expands this schedule into concrete occurrences overlapping {@code [rangeFrom, rangeTo)}.
     * When {@code rangeFrom} or {@code rangeTo} is null, that bound is left open.
     */
    public List<Occurrence> expandOccurrences(OffsetDateTime rangeFrom, OffsetDateTime rangeTo) {
        if (Objects.isNull(startTimestamp) || Objects.isNull(endTimestamp) || !startTimestamp.isBefore(endTimestamp)) {
            return List.of();
        }
        if (Objects.nonNull(rangeFrom) && Objects.nonNull(rangeTo) && !rangeFrom.isBefore(rangeTo)) {
            return List.of();
        }

        if (!isRecurring()) {
            if (isExcluded(startTimestamp)) {
                return List.of();
            }
            if (overlapsWindow(startTimestamp, endTimestamp, rangeFrom, rangeTo)) {
                return List.of(new Occurrence(startTimestamp, endTimestamp));
            }
            return List.of();
        }

        RecurrenceRule parsed = parseRRule(rrule, resolveZoneId());
        int limit = (Objects.isNull(rangeTo) && Objects.isNull(parsed.count()) && Objects.isNull(parsed.until()))
                ? DEFAULT_UNBOUNDED_OCCURRENCES
                : MAX_EXPANDED_OCCURRENCES;
        return generateOccurrencesInternal(parsed, rangeFrom, rangeTo, true, limit);
    }

    /**
     * Checks whether any occurrence of this schedule overlaps the given {@code [otherStart, otherEnd)} timeframe.
     */
    public boolean overlaps(OffsetDateTime otherStart, OffsetDateTime otherEnd) {
        if (Objects.isNull(otherStart) || Objects.isNull(otherEnd) || !otherStart.isBefore(otherEnd)) {
            return false;
        }
        if (Objects.isNull(startTimestamp) || Objects.isNull(endTimestamp) || !startTimestamp.isBefore(endTimestamp)) {
            return false;
        }
        if (!startTimestamp.isBefore(otherEnd)) {
            return false;
        }
        OffsetDateTime effectiveEnd = Objects.nonNull(recurrenceEnd) ? recurrenceEnd : (!isRecurring() ? endTimestamp : null);
        if (Objects.nonNull(effectiveEnd) && !effectiveEnd.isAfter(otherStart)) {
            return false;
        }
        return !expandOccurrences(otherStart, otherEnd).isEmpty();
    }

    /**
     * Checks whether any occurrence of this schedule overlaps any occurrence of {@code other}.
     */
    public boolean overlaps(Schedule other) {
        if (Objects.isNull(other) || Objects.isNull(other.getStartTimestamp()) || Objects.isNull(other.getEndTimestamp())) {
            return false;
        }
        if (Objects.isNull(startTimestamp) || Objects.isNull(endTimestamp)) {
            return false;
        }

        if (!this.isRecurring() && !other.isRecurring()) {
            return !this.isExcluded(this.startTimestamp)
                    && !other.isExcluded(other.getStartTimestamp())
                    && this.startTimestamp.isBefore(other.getEndTimestamp())
                    && this.endTimestamp.isAfter(other.getStartTimestamp());
        }

        OffsetDateTime windowStart = this.startTimestamp.isAfter(other.getStartTimestamp())
                ? this.startTimestamp : other.getStartTimestamp();

        OffsetDateTime thisEnd = Objects.nonNull(this.recurrenceEnd)
                ? this.recurrenceEnd
                : (this.isRecurring() ? null : this.endTimestamp);
        OffsetDateTime otherEnd = Objects.nonNull(other.getRecurrenceEnd())
                ? other.getRecurrenceEnd()
                : (other.isRecurring() ? null : other.getEndTimestamp());

        OffsetDateTime windowEnd = resolveOverlapWindowEnd(windowStart, thisEnd, otherEnd);
        if (!windowStart.isBefore(windowEnd)) {
            return false;
        }

        List<Occurrence> thisOccurrences = this.expandOccurrences(windowStart, windowEnd);
        if (thisOccurrences.isEmpty()) {
            return false;
        }
        List<Occurrence> otherOccurrences = other.expandOccurrences(windowStart, windowEnd);
        if (otherOccurrences.isEmpty()) {
            return false;
        }

        return occurrencesOverlap(thisOccurrences, otherOccurrences);
    }

    private static OffsetDateTime resolveOverlapWindowEnd(OffsetDateTime windowStart, OffsetDateTime thisEnd, OffsetDateTime otherEnd) {
        if (Objects.nonNull(thisEnd) && Objects.nonNull(otherEnd)) {
            return thisEnd.isBefore(otherEnd) ? thisEnd : otherEnd;
        }
        if (Objects.nonNull(thisEnd)) {
            return thisEnd;
        }
        if (Objects.nonNull(otherEnd)) {
            return otherEnd;
        }
        return windowStart.plus(UNBOUNDED_OVERLAP_HORIZON);
    }

    private static boolean occurrencesOverlap(List<Occurrence> listA, List<Occurrence> listB) {
        int i = 0;
        int j = 0;
        while (i < listA.size() && j < listB.size()) {
            Occurrence a = listA.get(i);
            Occurrence b = listB.get(j);
            if (a.startTimestamp().isBefore(b.endTimestamp()) && a.endTimestamp().isAfter(b.startTimestamp())) {
                return true;
            }
            if (a.endTimestamp().isBefore(b.endTimestamp())) {
                i++;
            } else {
                j++;
            }
        }
        return false;
    }

    /**
     * Adds an exception timestamp (RFC 5545 {@code EXDATE}) to skip a specific occurrence.
     */
    public void addExdate(OffsetDateTime exdate) {
        if (Objects.isNull(exdate)) {
            throw new IllegalArgumentException("Exception date (EXDATE) must not be null");
        }
        if (Objects.isNull(exdates)) {
            exdates = new ArrayList<>();
        }
        Instant target = exdate.toInstant();
        boolean exists = exdates.stream().anyMatch(existing -> Objects.nonNull(existing) && existing.toInstant().equals(target));
        if (!exists) {
            exdates.add(exdate);
        }
    }

    /**
     * Removes an exception timestamp (RFC 5545 {@code EXDATE}) matching the given instant.
     */
    public boolean removeExdate(OffsetDateTime exdate) {
        if (Objects.isNull(exdate) || Objects.isNull(exdates) || exdates.isEmpty()) {
            return false;
        }
        Instant target = exdate.toInstant();
        return exdates.removeIf(existing -> Objects.nonNull(existing) && existing.toInstant().equals(target));
    }

    /**
     * Formats this schedule as an RFC 5545 {@code VEVENT} block.
     */
    public String toICalendarVEvent() {
        if (Objects.isNull(startTimestamp) || Objects.isNull(endTimestamp)) {
            throw new IllegalStateException("Schedule must have startTimestamp and endTimestamp to format as iCalendar");
        }
        validateAndNormalizeRecurrence();
        StringBuilder sb = new StringBuilder();
        sb.append("BEGIN:VEVENT\r\n");
        String uid = (Objects.nonNull(id) ? "schedule-" + id : "schedule-temp") + "@oficiosya.uy";
        sb.append("UID:").append(uid).append("\r\n");
        sb.append("DTSTAMP:").append(ICAL_UTC_FORMAT.format(startTimestamp.toInstant())).append("\r\n");
        if (Objects.nonNull(tzid) && !tzid.isBlank()) {
            ZoneId zone = resolveZoneId();
            sb.append(PROP_DTSTART).append(";").append(PROP_TZID).append("=").append(tzid).append(":")
                    .append(ICAL_LOCAL_DT_FORMAT.format(startTimestamp.atZoneSameInstant(zone))).append("\r\n");
            sb.append(PROP_DTEND).append(";").append(PROP_TZID).append("=").append(tzid).append(":")
                    .append(ICAL_LOCAL_DT_FORMAT.format(endTimestamp.atZoneSameInstant(zone))).append("\r\n");
        } else {
            sb.append(PROP_DTSTART).append(":").append(ICAL_UTC_FORMAT.format(startTimestamp.toInstant())).append("\r\n");
            sb.append(PROP_DTEND).append(":").append(ICAL_UTC_FORMAT.format(endTimestamp.toInstant())).append("\r\n");
        }
        if (Objects.nonNull(type)) {
            sb.append(PROP_SUMMARY).append(":").append(type.name()).append("\r\n");
        }
        if (isRecurring()) {
            sb.append(RRULE_PREFIX).append(rrule).append("\r\n");
        }
        if (Objects.nonNull(exdates) && !exdates.isEmpty()) {
            String formattedExdates = exdates.stream()
                    .filter(Objects::nonNull)
                    .sorted(Comparator.comparing(OffsetDateTime::toInstant))
                    .map(dt -> ICAL_UTC_FORMAT.format(dt.toInstant()))
                    .collect(Collectors.joining(","));
            if (!formattedExdates.isEmpty()) {
                sb.append(PROP_EXDATE).append(":").append(formattedExdates).append("\r\n");
            }
        }
        sb.append("END:VEVENT");
        return sb.toString();
    }

    /**
     * Formats this schedule as a complete RFC 5545 {@code VCALENDAR} document.
     */
    public String toICalendar() {
        return "BEGIN:VCALENDAR\r\n"
                + "VERSION:2.0\r\n"
                + "PRODID:-//OficiosYa//Schedule//EN\r\n"
                + "CALSCALE:GREGORIAN\r\n"
                + toICalendarVEvent() + "\r\n"
                + "END:VCALENDAR\r\n";
    }

    /**
     * Parses an RFC 5545 {@code VCALENDAR} or {@code VEVENT} string and applies its metadata to this schedule.
     */
    public void applyICalendarVEvent(String icsContent) {
        if (Objects.isNull(icsContent) || icsContent.isBlank()) {
            throw new IllegalArgumentException("iCalendar content must not be blank");
        }
        String unfolded = ICAL_UNFOLD_PATTERN.matcher(icsContent).replaceAll("");
        String[] lines = ICAL_LINE_BREAK_PATTERN.split(unfolded);

        ParsedVEvent event = parseVEventLines(lines, this.type);
        if (Objects.isNull(event.startTimestamp()) || Objects.isNull(event.endTimestamp())) {
            throw new IllegalArgumentException("VEVENT component must include DTSTART and DTEND");
        }
        this.startTimestamp = event.startTimestamp();
        this.endTimestamp = event.endTimestamp();
        this.tzid = event.tzid();
        this.rrule = event.rrule();
        this.exdates = event.exdates();
        this.type = Objects.nonNull(event.type()) ? event.type() : (Objects.nonNull(this.type) ? this.type : ScheduleType.URGENT_AVAILABLE);
        validateAndNormalizeRecurrence();
    }

    private record ParsedVEvent(
            OffsetDateTime startTimestamp,
            OffsetDateTime endTimestamp,
            String tzid,
            String rrule,
            ScheduleType type,
            List<OffsetDateTime> exdates
    ) {}

    private static ParsedVEvent parseVEventLines(String[] lines, ScheduleType initialType) {
        OffsetDateTime parsedStart = null;
        OffsetDateTime parsedEnd = null;
        String parsedTzid = null;
        String parsedRRule = null;
        ScheduleType parsedType = initialType;
        List<OffsetDateTime> parsedExdates = new ArrayList<>();

        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (!isIgnorableIcalLine(line)) {
                int colonIdx = line.indexOf(':');
                if (colonIdx > 0) {
                    String propPart = line.substring(0, colonIdx).trim();
                    String valuePart = line.substring(colonIdx + 1).trim();
                    String[] propTokens = propPart.split(";");
                    String propName = propTokens[0].toUpperCase(Locale.ROOT);
                    String lineTzid = extractTzidParam(propTokens);

                    switch (propName) {
                        case PROP_TZID -> parsedTzid = valuePart;
                        case PROP_DTSTART -> {
                            if (Objects.nonNull(lineTzid)) {
                                parsedTzid = lineTzid;
                            }
                            ZoneId zone = resolveZoneForParsing(Objects.nonNull(lineTzid) ? lineTzid : parsedTzid);
                            parsedStart = parseICalDateTime(valuePart, zone, false);
                        }
                        case PROP_DTEND -> {
                            ZoneId zone = resolveZoneForParsing(Objects.nonNull(lineTzid) ? lineTzid : parsedTzid);
                            parsedEnd = parseICalDateTime(valuePart, zone, false);
                        }
                        case PROP_RRULE -> parsedRRule = valuePart;
                        case PROP_EXDATE -> {
                            ZoneId zone = resolveZoneForParsing(Objects.nonNull(lineTzid) ? lineTzid : parsedTzid);
                            for (String exToken : valuePart.split(",")) {
                                if (!exToken.isBlank()) {
                                    parsedExdates.add(parseICalDateTime(exToken.trim(), zone, false));
                                }
                            }
                        }
                        case PROP_SUMMARY -> {
                            try {
                                parsedType = ScheduleType.valueOf(valuePart.toUpperCase(Locale.ROOT));
                            } catch (IllegalArgumentException _) {
                                // Keep current schedule type when SUMMARY is a custom human-readable description
                            }
                        }
                        default -> {
                            // Ignored RFC 5545 properties
                        }
                    }
                }
            }
        }
        return new ParsedVEvent(parsedStart, parsedEnd, parsedTzid, parsedRRule, parsedType, parsedExdates);
    }

    private static boolean isIgnorableIcalLine(String line) {
        return line.isEmpty() || line.startsWith("BEGIN:") || line.startsWith("END:")
                || line.startsWith("VERSION:") || line.startsWith("PRODID:") || line.startsWith("CALSCALE:")
                || line.startsWith("UID:") || line.startsWith("DTSTAMP:");
    }

    private static String extractTzidParam(String[] propTokens) {
        String prefix = PROP_TZID + "=";
        for (int i = 1; i < propTokens.length; i++) {
            String param = propTokens[i].trim();
            if (param.toUpperCase(Locale.ROOT).startsWith(prefix)) {
                return param.substring(prefix.length()).trim();
            }
        }
        return null;
    }

    /**
     * Creates a {@link Schedule} instance from an RFC 5545 {@code VCALENDAR} or {@code VEVENT} string.
     */
    public static Schedule fromICalendar(String icsContent) {
        Schedule schedule = new Schedule();
        schedule.applyICalendarVEvent(icsContent);
        return schedule;
    }

    private List<Occurrence> generateOccurrencesInternal(
            RecurrenceRule rule,
            OffsetDateTime rangeFrom,
            OffsetDateTime rangeTo,
            boolean applyExdates,
            int maxResults
    ) {
        ZoneId zone = resolveZoneId();
        ZonedDateTime baseStartZoned = startTimestamp.atZoneSameInstant(zone);
        LocalDate baseDate = baseStartZoned.toLocalDate();
        Duration duration = Duration.between(startTimestamp, endTimestamp);

        List<Occurrence> results = new ArrayList<>();
        int generatedCount = 0;
        boolean stop = false;

        for (int dayOffset = 0; dayOffset <= MAX_CANDIDATE_DAYS && !stop; dayOffset++) {
            LocalDate candidateDate = baseDate.plusDays(dayOffset);
            if (matchesRecurrenceDate(baseDate, candidateDate, rule)) {
                ZonedDateTime occStartZoned = ZonedDateTime.of(candidateDate, baseStartZoned.toLocalTime(), zone);
                OffsetDateTime occStart = occStartZoned.toOffsetDateTime();
                OffsetDateTime occEnd = occStart.plus(duration);

                if (!occStart.isBefore(startTimestamp)) {
                    if (Objects.nonNull(rule.until()) && occStart.toInstant().isAfter(rule.until().toInstant())) {
                        stop = true;
                    } else {
                        generatedCount++;
                        if (Objects.nonNull(rule.count()) && generatedCount > rule.count()) {
                            stop = true;
                        } else {
                            boolean inRange = Objects.isNull(rangeTo) || occStart.isBefore(rangeTo);
                            if (inRange) {
                                boolean excluded = applyExdates && isExcluded(occStart);
                                if (!excluded && overlapsWindow(occStart, occEnd, rangeFrom, rangeTo)) {
                                    results.add(new Occurrence(occStart, occEnd));
                                    if (results.size() >= maxResults) {
                                        stop = true;
                                    }
                                }
                            } else if (Objects.isNull(rule.count())) {
                                stop = true;
                            }
                            if (Objects.nonNull(rule.count()) && Integer.valueOf(generatedCount).equals(rule.count())) {
                                stop = true;
                            }
                        }
                    }
                }
            }
        }
        return results;
    }

    private boolean matchesRecurrenceDate(LocalDate baseDate, LocalDate candidate, RecurrenceRule rule) {
        if (candidate.isBefore(baseDate)) {
            return false;
        }
        if (!rule.byMonth().isEmpty() && !rule.byMonth().contains(candidate.getMonthValue())) {
            return false;
        }

        return switch (rule.freq()) {
            case DAILY -> matchesDaily(baseDate, candidate, rule);
            case WEEKLY -> matchesWeekly(baseDate, candidate, rule);
            case MONTHLY -> matchesMonthly(baseDate, candidate, rule);
            case YEARLY -> matchesYearly(baseDate, candidate, rule);
        };
    }

    private static boolean matchesDaily(LocalDate baseDate, LocalDate candidate, RecurrenceRule rule) {
        long daysBetween = ChronoUnit.DAYS.between(baseDate, candidate);
        if (daysBetween % rule.interval() != 0) {
            return false;
        }
        if (!rule.byMonthDay().isEmpty() && !matchesMonthDay(candidate, rule.byMonthDay())) {
            return false;
        }
        return rule.byDay().isEmpty() || matchesSimpleByDay(candidate, rule.byDay());
    }

    private static boolean matchesWeekly(LocalDate baseDate, LocalDate candidate, RecurrenceRule rule) {
        LocalDate baseWeekStart = baseDate.with(TemporalAdjusters.previousOrSame(rule.wkst()));
        LocalDate candidateWeekStart = candidate.with(TemporalAdjusters.previousOrSame(rule.wkst()));
        long weeksBetween = ChronoUnit.WEEKS.between(baseWeekStart, candidateWeekStart);
        if (weeksBetween < 0 || weeksBetween % rule.interval() != 0) {
            return false;
        }
        if (rule.byDay().isEmpty()) {
            return candidate.getDayOfWeek().equals(baseDate.getDayOfWeek());
        }
        return matchesSimpleByDay(candidate, rule.byDay());
    }

    private static boolean matchesMonthly(LocalDate baseDate, LocalDate candidate, RecurrenceRule rule) {
        YearMonth baseYm = YearMonth.from(baseDate);
        YearMonth candidateYm = YearMonth.from(candidate);
        long monthsBetween = ChronoUnit.MONTHS.between(baseYm, candidateYm);
        if (monthsBetween < 0 || monthsBetween % rule.interval() != 0) {
            return false;
        }
        if (!rule.byMonthDay().isEmpty()) {
            if (!matchesMonthDay(candidate, rule.byMonthDay())) {
                return false;
            }
            return rule.byDay().isEmpty() || matchesMonthlyByDay(candidate, rule.byDay());
        }
        if (!rule.byDay().isEmpty()) {
            return matchesMonthlyByDay(candidate, rule.byDay());
        }
        return Integer.valueOf(candidate.getDayOfMonth()).equals(baseDate.getDayOfMonth());
    }

    private static boolean matchesYearly(LocalDate baseDate, LocalDate candidate, RecurrenceRule rule) {
        long yearsBetween = (long) candidate.getYear() - baseDate.getYear();
        if (yearsBetween < 0 || yearsBetween % rule.interval() != 0) {
            return false;
        }
        boolean sameMonth = Integer.valueOf(candidate.getMonthValue()).equals(baseDate.getMonthValue());
        boolean sameDay = Integer.valueOf(candidate.getDayOfMonth()).equals(baseDate.getDayOfMonth());
        if (rule.byMonth().isEmpty() && rule.byDay().isEmpty() && rule.byMonthDay().isEmpty()) {
            return sameMonth && sameDay;
        }
        if (!rule.byMonthDay().isEmpty() && !matchesMonthDay(candidate, rule.byMonthDay())) {
            return false;
        }
        if (!rule.byDay().isEmpty()) {
            if (!rule.byMonth().isEmpty()) {
                return matchesMonthlyByDay(candidate, rule.byDay());
            }
            return matchesYearlyByDay(candidate, rule.byDay());
        }
        return !rule.byMonthDay().isEmpty() || sameDay;
    }

    private static boolean matchesMonthDay(LocalDate candidate, List<Integer> byMonthDay) {
        int dom = candidate.getDayOfMonth();
        int lengthOfMonth = candidate.lengthOfMonth();
        int negativeDom = dom - lengthOfMonth - 1;
        return byMonthDay.contains(dom) || byMonthDay.contains(negativeDom);
    }

    private static boolean matchesSimpleByDay(LocalDate candidate, List<ByDayEntry> byDay) {
        DayOfWeek dow = candidate.getDayOfWeek();
        return byDay.stream().anyMatch(entry -> entry.dayOfWeek().equals(dow));
    }

    private static boolean matchesMonthlyByDay(LocalDate candidate, List<ByDayEntry> byDay) {
        DayOfWeek dow = candidate.getDayOfWeek();
        int positiveOrdinal = (candidate.getDayOfMonth() - 1) / 7 + 1;
        int negativeOrdinal = -((candidate.lengthOfMonth() - candidate.getDayOfMonth()) / 7 + 1);
        return byDay.stream()
                .filter(entry -> entry.dayOfWeek().equals(dow))
                .anyMatch(entry -> Objects.isNull(entry.ordinal())
                        || Integer.valueOf(positiveOrdinal).equals(entry.ordinal())
                        || Integer.valueOf(negativeOrdinal).equals(entry.ordinal()));
    }

    private static boolean matchesYearlyByDay(LocalDate candidate, List<ByDayEntry> byDay) {
        DayOfWeek dow = candidate.getDayOfWeek();
        int positiveOrdinal = (candidate.getDayOfYear() - 1) / 7 + 1;
        int negativeOrdinal = -((candidate.lengthOfYear() - candidate.getDayOfYear()) / 7 + 1);
        return byDay.stream()
                .filter(entry -> entry.dayOfWeek().equals(dow))
                .anyMatch(entry -> Objects.isNull(entry.ordinal())
                        || Integer.valueOf(positiveOrdinal).equals(entry.ordinal())
                        || Integer.valueOf(negativeOrdinal).equals(entry.ordinal()));
    }

    private boolean isExcluded(OffsetDateTime occurrenceStart) {
        if (Objects.isNull(exdates) || exdates.isEmpty() || Objects.isNull(occurrenceStart)) {
            return false;
        }
        Instant target = occurrenceStart.toInstant();
        return exdates.stream().anyMatch(ex -> Objects.nonNull(ex) && ex.toInstant().equals(target));
    }

    private static boolean overlapsWindow(
            OffsetDateTime start,
            OffsetDateTime end,
            OffsetDateTime rangeFrom,
            OffsetDateTime rangeTo
    ) {
        if (Objects.nonNull(rangeFrom) && !end.isAfter(rangeFrom)) {
            return false;
        }
        return Objects.isNull(rangeTo) || start.isBefore(rangeTo);
    }

    private static List<ByDayEntry> parseByDay(String rawByDay, Frequency freq) {
        String[] tokens = rawByDay.split(",");
        List<ByDayEntry> result = new ArrayList<>(tokens.length);
        for (String token : tokens) {
            String trimmed = token.trim();
            Matcher matcher = BYDAY_PATTERN.matcher(trimmed);
            if (!matcher.matches()) {
                throw new IllegalArgumentException("Invalid BYDAY value in RRULE: " + token);
            }
            Integer ordinal = null;
            if (Objects.nonNull(matcher.group(1))) {
                if (!Frequency.MONTHLY.equals(freq) && !Frequency.YEARLY.equals(freq)) {
                    throw new IllegalArgumentException("BYDAY with ordinal is only valid for MONTHLY or YEARLY frequencies");
                }
                ordinal = Integer.parseInt(matcher.group(1));
            }
            DayOfWeek dow = parseIcalDay(matcher.group(2));
            result.add(new ByDayEntry(ordinal, dow));
        }
        if (result.isEmpty()) {
            throw new IllegalArgumentException("BYDAY must not be empty in RRULE");
        }
        return List.copyOf(result);
    }

    private static List<Integer> parseByMonthDay(String rawByMonthDay, Frequency freq) {
        if (Frequency.WEEKLY.equals(freq)) {
            throw new IllegalArgumentException("BYMONTHDAY is not valid when FREQ=WEEKLY (RFC 5545)");
        }
        String[] tokens = rawByMonthDay.split(",");
        List<Integer> result = new ArrayList<>(tokens.length);
        for (String token : tokens) {
            try {
                int day = Integer.parseInt(token.trim());
                if (Integer.valueOf(0).equals(day) || day < -31 || day > 31) {
                    throw new IllegalArgumentException("BYMONTHDAY out of range (-31..31, excluding 0): " + day);
                }
                result.add(day);
            } catch (NumberFormatException ex) {
                throw new IllegalArgumentException("Invalid BYMONTHDAY value in RRULE: " + token, ex);
            }
        }
        if (result.isEmpty()) {
            throw new IllegalArgumentException("BYMONTHDAY must not be empty in RRULE");
        }
        return List.copyOf(result);
    }

    private static List<Integer> parseByMonth(String rawByMonth) {
        String[] tokens = rawByMonth.split(",");
        List<Integer> result = new ArrayList<>(tokens.length);
        for (String token : tokens) {
            try {
                int month = Integer.parseInt(token.trim());
                if (month < 1 || month > 12) {
                    throw new IllegalArgumentException("BYMONTH out of range (1..12): " + month);
                }
                result.add(month);
            } catch (NumberFormatException ex) {
                throw new IllegalArgumentException("Invalid BYMONTH value in RRULE: " + token, ex);
            }
        }
        if (result.isEmpty()) {
            throw new IllegalArgumentException("BYMONTH must not be empty in RRULE");
        }
        return List.copyOf(result);
    }

    private static DayOfWeek parseIcalDay(String dayCode) {
        return switch (dayCode.trim().toUpperCase(Locale.ROOT)) {
            case "MO" -> DayOfWeek.MONDAY;
            case "TU" -> DayOfWeek.TUESDAY;
            case "WE" -> DayOfWeek.WEDNESDAY;
            case "TH" -> DayOfWeek.THURSDAY;
            case "FR" -> DayOfWeek.FRIDAY;
            case "SA" -> DayOfWeek.SATURDAY;
            case "SU" -> DayOfWeek.SUNDAY;
            default -> throw new IllegalArgumentException("Invalid day of week in RRULE: " + dayCode);
        };
    }

    private static ZoneId resolveZoneForParsing(String tzidCandidate) {
        if (Objects.nonNull(tzidCandidate) && !tzidCandidate.isBlank()) {
            try {
                return ZoneId.of(tzidCandidate.trim());
            } catch (DateTimeException ex) {
                throw new IllegalArgumentException("Invalid TZID in iCalendar: " + tzidCandidate, ex);
            }
        }
        return ZoneOffset.UTC;
    }

    private static OffsetDateTime parseICalDateTime(String rawValue, ZoneId defaultZone, boolean endOfDayIfDateOnly) {
        String value = rawValue.trim();
        ZoneId zone = Objects.nonNull(defaultZone) ? defaultZone : ZoneOffset.UTC;
        try {
            if (value.endsWith("Z") && Integer.valueOf(16).equals(value.length()) && Character.valueOf('T').equals(value.charAt(8))) {
                LocalDateTime ldt = LocalDateTime.parse(value.substring(0, value.length() - 1), ICAL_LOCAL_DT_FORMAT);
                return ldt.atOffset(ZoneOffset.UTC);
            }
            if (Integer.valueOf(8).equals(value.length()) && value.chars().allMatch(Character::isDigit)) {
                LocalDate date = LocalDate.parse(value, ICAL_DATE_FORMAT);
                LocalDateTime ldt = endOfDayIfDateOnly ? date.atTime(23, 59, 59) : date.atStartOfDay();
                return ldt.atZone(zone).toOffsetDateTime();
            }
            if (Integer.valueOf(15).equals(value.length()) && Character.valueOf('T').equals(value.charAt(8))) {
                LocalDateTime ldt = LocalDateTime.parse(value, ICAL_LOCAL_DT_FORMAT);
                return ldt.atZone(zone).toOffsetDateTime();
            }
            return OffsetDateTime.parse(value);
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("Invalid RFC 5545 date-time value: " + rawValue, ex);
        }
    }

    private static List<OffsetDateTime> deduplicateByInstant(List<OffsetDateTime> timestamps) {
        Map<Instant, OffsetDateTime> unique = new LinkedHashMap<>();
        for (OffsetDateTime ts : timestamps) {
            if (Objects.nonNull(ts)) {
                unique.putIfAbsent(ts.toInstant(), ts);
            }
        }
        return new ArrayList<>(unique.values());
    }
}
