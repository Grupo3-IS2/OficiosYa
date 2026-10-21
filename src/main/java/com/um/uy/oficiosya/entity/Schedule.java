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
            if (ordinal != null && (ordinal == 0 || ordinal < -53 || ordinal > 53)) {
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
            if (byDay == null) {
                byDay = List.of();
            }
            if (byMonthDay == null) {
                byMonthDay = List.of();
            }
            if (byMonth == null) {
                byMonth = List.of();
            }
            if (wkst == null) {
                wkst = DayOfWeek.MONDAY;
            }
        }

        public String toNormalizedString() {
            List<String> parts = new ArrayList<>();
            parts.add("FREQ=" + freq.name());
            if (interval > 1) {
                parts.add("INTERVAL=" + interval);
            }
            if (count != null) {
                parts.add("COUNT=" + count);
            }
            if (until != null) {
                parts.add("UNTIL=" + ICAL_UTC_FORMAT.format(until.toInstant()));
            }
            if (byMonth != null && !byMonth.isEmpty()) {
                parts.add("BYMONTH=" + byMonth.stream().map(String::valueOf).collect(Collectors.joining(",")));
            }
            if (byMonthDay != null && !byMonthDay.isEmpty()) {
                parts.add("BYMONTHDAY=" + byMonthDay.stream().map(String::valueOf).collect(Collectors.joining(",")));
            }
            if (byDay != null && !byDay.isEmpty()) {
                parts.add("BYDAY=" + byDay.stream()
                        .map(entry -> (entry.ordinal() != null ? entry.ordinal().toString() : "") + toIcalDay(entry.dayOfWeek()))
                        .collect(Collectors.joining(",")));
            }
            if (wkst != null && wkst != DayOfWeek.MONDAY) {
                parts.add("WKST=" + toIcalDay(wkst));
            }
            return String.join(";", parts);
        }
    }

    public record Occurrence(OffsetDateTime startTimestamp, OffsetDateTime endTimestamp) {}

    public boolean isRecurring() {
        return rrule != null && !rrule.isBlank();
    }

    public ZoneId resolveZoneId() {
        if (tzid != null && !tzid.isBlank()) {
            try {
                return ZoneId.of(tzid.trim());
            } catch (DateTimeException ex) {
                throw new IllegalArgumentException("Invalid time zone identifier (TZID): " + tzid, ex);
            }
        }
        if (startTimestamp != null) {
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
        if (exdates == null) {
            exdates = new ArrayList<>();
        } else {
            exdates = deduplicateByInstant(exdates);
        }

        if (tzid != null) {
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

        if (rrule != null) {
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
        if (startTimestamp == null || endTimestamp == null || !startTimestamp.isBefore(endTimestamp)) {
            recurrenceEnd = endTimestamp;
            return;
        }
        if (!isRecurring()) {
            recurrenceEnd = endTimestamp;
            return;
        }
        RecurrenceRule parsed = parseRRule(rrule, resolveZoneId());
        if (parsed.count() == null && parsed.until() == null) {
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
        if (rawRRule == null || rawRRule.isBlank()) {
            throw new IllegalArgumentException("Recurrence rule (RRULE) must not be blank");
        }
        String cleaned = rawRRule.trim();
        if (cleaned.toUpperCase(Locale.ROOT).startsWith("RRULE:")) {
            cleaned = cleaned.substring("RRULE:".length()).trim();
        }
        if (cleaned.isEmpty()) {
            throw new IllegalArgumentException("Recurrence rule (RRULE) must not be blank");
        }

        Map<String, String> properties = new LinkedHashMap<>();
        String[] tokens = cleaned.split(";");
        for (String token : tokens) {
            if (token.isBlank()) {
                continue;
            }
            int eqIdx = token.indexOf('=');
            if (eqIdx <= 0 || eqIdx == token.length() - 1) {
                throw new IllegalArgumentException("Invalid property in RRULE: " + token);
            }
            String key = token.substring(0, eqIdx).trim().toUpperCase(Locale.ROOT);
            String value = token.substring(eqIdx + 1).trim().toUpperCase(Locale.ROOT);
            if (properties.put(key, value) != null) {
                throw new IllegalArgumentException("Duplicate property in RRULE: " + key);
            }
        }

        String freqStr = properties.get("FREQ");
        if (freqStr == null) {
            throw new IllegalArgumentException("RRULE must specify FREQ (DAILY, WEEKLY, MONTHLY, or YEARLY)");
        }
        Frequency freq;
        try {
            freq = Frequency.valueOf(freqStr);
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("Unsupported frequency (FREQ) in RRULE: " + freqStr, ex);
        }

        int interval = 1;
        if (properties.containsKey("INTERVAL")) {
            try {
                interval = Integer.parseInt(properties.get("INTERVAL"));
            } catch (NumberFormatException ex) {
                throw new IllegalArgumentException("INTERVAL must be a positive integer in RRULE", ex);
            }
            if (interval <= 0) {
                throw new IllegalArgumentException("INTERVAL must be greater than 0 in RRULE");
            }
        }

        Integer count = null;
        if (properties.containsKey("COUNT")) {
            try {
                count = Integer.parseInt(properties.get("COUNT"));
            } catch (NumberFormatException ex) {
                throw new IllegalArgumentException("COUNT must be a positive integer in RRULE", ex);
            }
            if (count <= 0 || count > MAX_EXPANDED_OCCURRENCES) {
                throw new IllegalArgumentException("COUNT must be between 1 and " + MAX_EXPANDED_OCCURRENCES + " in RRULE");
            }
        }

        OffsetDateTime until = null;
        if (properties.containsKey("UNTIL")) {
            until = parseICalDateTime(properties.get("UNTIL"), defaultZone != null ? defaultZone : ZoneOffset.UTC, true);
        }

        if (count != null && until != null) {
            throw new IllegalArgumentException("RRULE must not contain both COUNT and UNTIL (RFC 5545)");
        }

        List<ByDayEntry> byDay = List.of();
        if (properties.containsKey("BYDAY")) {
            byDay = parseByDay(properties.get("BYDAY"), freq);
        }

        List<Integer> byMonthDay = List.of();
        if (properties.containsKey("BYMONTHDAY")) {
            byMonthDay = parseByMonthDay(properties.get("BYMONTHDAY"), freq);
        }

        List<Integer> byMonth = List.of();
        if (properties.containsKey("BYMONTH")) {
            byMonth = parseByMonth(properties.get("BYMONTH"));
        }

        DayOfWeek wkst = DayOfWeek.MONDAY;
        if (properties.containsKey("WKST")) {
            wkst = parseIcalDay(properties.get("WKST"));
        }

        Set<String> supportedKeys = Set.of("FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH", "WKST");
        for (String key : properties.keySet()) {
            if (!supportedKeys.contains(key)) {
                throw new IllegalArgumentException("Unsupported property in RRULE: " + key);
            }
        }

        return new RecurrenceRule(freq, interval, count, until, byDay, byMonthDay, byMonth, wkst);
    }

    /**
     * Expands this schedule into concrete occurrences overlapping {@code [rangeFrom, rangeTo)}.
     * When {@code rangeFrom} or {@code rangeTo} is null, that bound is left open.
     */
    public List<Occurrence> expandOccurrences(OffsetDateTime rangeFrom, OffsetDateTime rangeTo) {
        if (startTimestamp == null || endTimestamp == null || !startTimestamp.isBefore(endTimestamp)) {
            return List.of();
        }
        if (rangeFrom != null && rangeTo != null && !rangeFrom.isBefore(rangeTo)) {
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
        int limit = (rangeTo == null && parsed.count() == null && parsed.until() == null)
                ? DEFAULT_UNBOUNDED_OCCURRENCES
                : MAX_EXPANDED_OCCURRENCES;
        return generateOccurrencesInternal(parsed, rangeFrom, rangeTo, true, limit);
    }

    /**
     * Checks whether any occurrence of this schedule overlaps the given {@code [otherStart, otherEnd)} timeframe.
     */
    public boolean overlaps(OffsetDateTime otherStart, OffsetDateTime otherEnd) {
        if (otherStart == null || otherEnd == null || !otherStart.isBefore(otherEnd)) {
            return false;
        }
        if (startTimestamp == null || endTimestamp == null || !startTimestamp.isBefore(endTimestamp)) {
            return false;
        }
        if (!startTimestamp.isBefore(otherEnd)) {
            return false;
        }
        OffsetDateTime effectiveEnd = recurrenceEnd != null ? recurrenceEnd : (!isRecurring() ? endTimestamp : null);
        if (effectiveEnd != null && !effectiveEnd.isAfter(otherStart)) {
            return false;
        }
        return !expandOccurrences(otherStart, otherEnd).isEmpty();
    }

    /**
     * Checks whether any occurrence of this schedule overlaps any occurrence of {@code other}.
     */
    public boolean overlaps(Schedule other) {
        if (other == null || other.getStartTimestamp() == null || other.getEndTimestamp() == null) {
            return false;
        }
        if (startTimestamp == null || endTimestamp == null) {
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

        OffsetDateTime thisEnd = this.recurrenceEnd != null
                ? this.recurrenceEnd
                : (this.isRecurring() ? null : this.endTimestamp);
        OffsetDateTime otherEnd = other.getRecurrenceEnd() != null
                ? other.getRecurrenceEnd()
                : (other.isRecurring() ? null : other.getEndTimestamp());

        OffsetDateTime windowEnd;
        if (thisEnd != null && otherEnd != null) {
            windowEnd = thisEnd.isBefore(otherEnd) ? thisEnd : otherEnd;
        } else if (thisEnd != null) {
            windowEnd = thisEnd;
        } else if (otherEnd != null) {
            windowEnd = otherEnd;
        } else {
            windowEnd = windowStart.plus(UNBOUNDED_OVERLAP_HORIZON);
        }

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

        int i = 0;
        int j = 0;
        while (i < thisOccurrences.size() && j < otherOccurrences.size()) {
            Occurrence a = thisOccurrences.get(i);
            Occurrence b = otherOccurrences.get(j);
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
        if (exdate == null) {
            throw new IllegalArgumentException("Exception date (EXDATE) must not be null");
        }
        if (exdates == null) {
            exdates = new ArrayList<>();
        }
        Instant target = exdate.toInstant();
        boolean exists = exdates.stream().anyMatch(existing -> existing != null && existing.toInstant().equals(target));
        if (!exists) {
            exdates.add(exdate);
        }
    }

    /**
     * Removes an exception timestamp (RFC 5545 {@code EXDATE}) matching the given instant.
     */
    public boolean removeExdate(OffsetDateTime exdate) {
        if (exdate == null || exdates == null || exdates.isEmpty()) {
            return false;
        }
        Instant target = exdate.toInstant();
        return exdates.removeIf(existing -> existing != null && existing.toInstant().equals(target));
    }

    /**
     * Formats this schedule as an RFC 5545 {@code VEVENT} block.
     */
    public String toICalendarVEvent() {
        if (startTimestamp == null || endTimestamp == null) {
            throw new IllegalStateException("Schedule must have startTimestamp and endTimestamp to format as iCalendar");
        }
        validateAndNormalizeRecurrence();
        StringBuilder sb = new StringBuilder();
        sb.append("BEGIN:VEVENT\r\n");
        String uid = (id != null ? "schedule-" + id : "schedule-temp") + "@oficiosya.uy";
        sb.append("UID:").append(uid).append("\r\n");
        sb.append("DTSTAMP:").append(ICAL_UTC_FORMAT.format(startTimestamp.toInstant())).append("\r\n");
        if (tzid != null && !tzid.isBlank()) {
            ZoneId zone = resolveZoneId();
            sb.append("DTSTART;TZID=").append(tzid).append(":")
                    .append(ICAL_LOCAL_DT_FORMAT.format(startTimestamp.atZoneSameInstant(zone))).append("\r\n");
            sb.append("DTEND;TZID=").append(tzid).append(":")
                    .append(ICAL_LOCAL_DT_FORMAT.format(endTimestamp.atZoneSameInstant(zone))).append("\r\n");
        } else {
            sb.append("DTSTART:").append(ICAL_UTC_FORMAT.format(startTimestamp.toInstant())).append("\r\n");
            sb.append("DTEND:").append(ICAL_UTC_FORMAT.format(endTimestamp.toInstant())).append("\r\n");
        }
        if (type != null) {
            sb.append("SUMMARY:").append(type.name()).append("\r\n");
        }
        if (isRecurring()) {
            sb.append("RRULE:").append(rrule).append("\r\n");
        }
        if (exdates != null && !exdates.isEmpty()) {
            String formattedExdates = exdates.stream()
                    .filter(Objects::nonNull)
                    .sorted(Comparator.comparing(OffsetDateTime::toInstant))
                    .map(dt -> ICAL_UTC_FORMAT.format(dt.toInstant()))
                    .collect(Collectors.joining(","));
            if (!formattedExdates.isEmpty()) {
                sb.append("EXDATE:").append(formattedExdates).append("\r\n");
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
        if (icsContent == null || icsContent.isBlank()) {
            throw new IllegalArgumentException("iCalendar content must not be blank");
        }
        String unfolded = ICAL_UNFOLD_PATTERN.matcher(icsContent).replaceAll("");
        String[] lines = ICAL_LINE_BREAK_PATTERN.split(unfolded);

        OffsetDateTime parsedStart = null;
        OffsetDateTime parsedEnd = null;
        String parsedTzid = null;
        String parsedRRule = null;
        ScheduleType parsedType = this.type;
        List<OffsetDateTime> parsedExdates = new ArrayList<>();

        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty() || line.startsWith("BEGIN:") || line.startsWith("END:")
                    || line.startsWith("VERSION:") || line.startsWith("PRODID:") || line.startsWith("CALSCALE:")
                    || line.startsWith("UID:") || line.startsWith("DTSTAMP:")) {
                continue;
            }
            int colonIdx = line.indexOf(':');
            if (colonIdx <= 0) {
                continue;
            }
            String propPart = line.substring(0, colonIdx).trim();
            String valuePart = line.substring(colonIdx + 1).trim();

            String[] propTokens = propPart.split(";");
            String propName = propTokens[0].toUpperCase(Locale.ROOT);
            String lineTzid = null;
            for (int i = 1; i < propTokens.length; i++) {
                String param = propTokens[i].trim();
                if (param.toUpperCase(Locale.ROOT).startsWith("TZID=")) {
                    lineTzid = param.substring("TZID=".length()).trim();
                }
            }

            switch (propName) {
                case "TZID" -> parsedTzid = valuePart;
                case "DTSTART" -> {
                    if (lineTzid != null) {
                        parsedTzid = lineTzid;
                    }
                    ZoneId zone = resolveZoneForParsing(lineTzid != null ? lineTzid : parsedTzid);
                    parsedStart = parseICalDateTime(valuePart, zone, false);
                }
                case "DTEND" -> {
                    ZoneId zone = resolveZoneForParsing(lineTzid != null ? lineTzid : parsedTzid);
                    parsedEnd = parseICalDateTime(valuePart, zone, false);
                }
                case "RRULE" -> parsedRRule = valuePart;
                case "EXDATE" -> {
                    ZoneId zone = resolveZoneForParsing(lineTzid != null ? lineTzid : parsedTzid);
                    for (String exToken : valuePart.split(",")) {
                        if (!exToken.isBlank()) {
                            parsedExdates.add(parseICalDateTime(exToken.trim(), zone, false));
                        }
                    }
                }
                case "SUMMARY" -> {
                    try {
                        parsedType = ScheduleType.valueOf(valuePart.toUpperCase(Locale.ROOT));
                    } catch (IllegalArgumentException ignored) {
                        // Keep current schedule type when SUMMARY is a human-readable description
                    }
                }
                default -> {
                    // Other RFC 5545 properties are ignored
                }
            }
        }

        if (parsedStart == null || parsedEnd == null) {
            throw new IllegalArgumentException("VEVENT component must include DTSTART and DTEND");
        }
        this.startTimestamp = parsedStart;
        this.endTimestamp = parsedEnd;
        this.tzid = parsedTzid;
        this.rrule = parsedRRule;
        this.exdates = parsedExdates;
        this.type = (parsedType != null) ? parsedType : (this.type != null ? this.type : ScheduleType.URGENT_AVAILABLE);
        validateAndNormalizeRecurrence();
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

        for (int dayOffset = 0; dayOffset <= MAX_CANDIDATE_DAYS; dayOffset++) {
            LocalDate candidateDate = baseDate.plusDays(dayOffset);
            if (!matchesRecurrenceDate(baseDate, candidateDate, rule)) {
                continue;
            }

            ZonedDateTime occStartZoned = ZonedDateTime.of(candidateDate, baseStartZoned.toLocalTime(), zone);
            OffsetDateTime occStart = occStartZoned.toOffsetDateTime();
            OffsetDateTime occEnd = occStart.plus(duration);

            if (occStart.isBefore(startTimestamp)) {
                continue;
            }
            if (rule.until() != null && occStart.toInstant().isAfter(rule.until().toInstant())) {
                break;
            }

            generatedCount++;
            if (rule.count() != null && generatedCount > rule.count()) {
                break;
            }

            if (rangeTo != null && !occStart.isBefore(rangeTo)) {
                if (rule.count() == null) {
                    break;
                }
                continue;
            }

            boolean excluded = applyExdates && isExcluded(occStart);
            if (!excluded && overlapsWindow(occStart, occEnd, rangeFrom, rangeTo)) {
                results.add(new Occurrence(occStart, occEnd));
                if (results.size() >= maxResults) {
                    break;
                }
            }

            if (rule.count() != null && generatedCount >= rule.count()) {
                break;
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
            case DAILY -> {
                long daysBetween = ChronoUnit.DAYS.between(baseDate, candidate);
                if (daysBetween % rule.interval() != 0) {
                    yield false;
                }
                if (!rule.byMonthDay().isEmpty() && !matchesMonthDay(candidate, rule.byMonthDay())) {
                    yield false;
                }
                yield rule.byDay().isEmpty() || matchesSimpleByDay(candidate, rule.byDay());
            }
            case WEEKLY -> {
                LocalDate baseWeekStart = baseDate.with(TemporalAdjusters.previousOrSame(rule.wkst()));
                LocalDate candidateWeekStart = candidate.with(TemporalAdjusters.previousOrSame(rule.wkst()));
                long weeksBetween = ChronoUnit.WEEKS.between(baseWeekStart, candidateWeekStart);
                if (weeksBetween < 0 || weeksBetween % rule.interval() != 0) {
                    yield false;
                }
                if (rule.byDay().isEmpty()) {
                    yield candidate.getDayOfWeek() == baseDate.getDayOfWeek();
                }
                yield matchesSimpleByDay(candidate, rule.byDay());
            }
            case MONTHLY -> {
                YearMonth baseYm = YearMonth.from(baseDate);
                YearMonth candidateYm = YearMonth.from(candidate);
                long monthsBetween = ChronoUnit.MONTHS.between(baseYm, candidateYm);
                if (monthsBetween < 0 || monthsBetween % rule.interval() != 0) {
                    yield false;
                }
                if (!rule.byMonthDay().isEmpty()) {
                    if (!matchesMonthDay(candidate, rule.byMonthDay())) {
                        yield false;
                    }
                    yield rule.byDay().isEmpty() || matchesMonthlyByDay(candidate, rule.byDay());
                }
                if (!rule.byDay().isEmpty()) {
                    yield matchesMonthlyByDay(candidate, rule.byDay());
                }
                yield candidate.getDayOfMonth() == baseDate.getDayOfMonth();
            }
            case YEARLY -> {
                long yearsBetween = (long) candidate.getYear() - baseDate.getYear();
                if (yearsBetween < 0 || yearsBetween % rule.interval() != 0) {
                    yield false;
                }
                if (rule.byMonth().isEmpty() && rule.byDay().isEmpty() && rule.byMonthDay().isEmpty()) {
                    yield candidate.getMonthValue() == baseDate.getMonthValue()
                            && candidate.getDayOfMonth() == baseDate.getDayOfMonth();
                }
                if (!rule.byMonthDay().isEmpty() && !matchesMonthDay(candidate, rule.byMonthDay())) {
                    yield false;
                }
                if (!rule.byDay().isEmpty()) {
                    if (!rule.byMonth().isEmpty()) {
                        yield matchesMonthlyByDay(candidate, rule.byDay());
                    }
                    yield matchesYearlyByDay(candidate, rule.byDay());
                }
                yield !rule.byMonthDay().isEmpty() || candidate.getDayOfMonth() == baseDate.getDayOfMonth();
            }
        };
    }

    private static boolean matchesMonthDay(LocalDate candidate, List<Integer> byMonthDay) {
        int dom = candidate.getDayOfMonth();
        int lengthOfMonth = candidate.lengthOfMonth();
        int negativeDom = dom - lengthOfMonth - 1;
        return byMonthDay.contains(dom) || byMonthDay.contains(negativeDom);
    }

    private static boolean matchesSimpleByDay(LocalDate candidate, List<ByDayEntry> byDay) {
        DayOfWeek dow = candidate.getDayOfWeek();
        return byDay.stream().anyMatch(entry -> entry.dayOfWeek() == dow);
    }

    private static boolean matchesMonthlyByDay(LocalDate candidate, List<ByDayEntry> byDay) {
        DayOfWeek dow = candidate.getDayOfWeek();
        int positiveOrdinal = (candidate.getDayOfMonth() - 1) / 7 + 1;
        int negativeOrdinal = -((candidate.lengthOfMonth() - candidate.getDayOfMonth()) / 7 + 1);
        for (ByDayEntry entry : byDay) {
            if (entry.dayOfWeek() != dow) {
                continue;
            }
            if (entry.ordinal() == null || entry.ordinal() == positiveOrdinal || entry.ordinal() == negativeOrdinal) {
                return true;
            }
        }
        return false;
    }

    private static boolean matchesYearlyByDay(LocalDate candidate, List<ByDayEntry> byDay) {
        DayOfWeek dow = candidate.getDayOfWeek();
        int positiveOrdinal = (candidate.getDayOfYear() - 1) / 7 + 1;
        int negativeOrdinal = -((candidate.lengthOfYear() - candidate.getDayOfYear()) / 7 + 1);
        for (ByDayEntry entry : byDay) {
            if (entry.dayOfWeek() != dow) {
                continue;
            }
            if (entry.ordinal() == null || entry.ordinal() == positiveOrdinal || entry.ordinal() == negativeOrdinal) {
                return true;
            }
        }
        return false;
    }

    private boolean isExcluded(OffsetDateTime occurrenceStart) {
        if (exdates == null || exdates.isEmpty() || occurrenceStart == null) {
            return false;
        }
        Instant target = occurrenceStart.toInstant();
        return exdates.stream().anyMatch(ex -> ex != null && ex.toInstant().equals(target));
    }

    private static boolean overlapsWindow(
            OffsetDateTime start,
            OffsetDateTime end,
            OffsetDateTime rangeFrom,
            OffsetDateTime rangeTo
    ) {
        if (rangeFrom != null && !end.isAfter(rangeFrom)) {
            return false;
        }
        return rangeTo == null || start.isBefore(rangeTo);
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
            if (matcher.group(1) != null) {
                if (freq != Frequency.MONTHLY && freq != Frequency.YEARLY) {
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
        if (freq == Frequency.WEEKLY) {
            throw new IllegalArgumentException("BYMONTHDAY is not valid when FREQ=WEEKLY (RFC 5545)");
        }
        String[] tokens = rawByMonthDay.split(",");
        List<Integer> result = new ArrayList<>(tokens.length);
        for (String token : tokens) {
            try {
                int day = Integer.parseInt(token.trim());
                if (day == 0 || day < -31 || day > 31) {
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

    private static String toIcalDay(DayOfWeek dayOfWeek) {
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

    private static ZoneId resolveZoneForParsing(String tzidCandidate) {
        if (tzidCandidate != null && !tzidCandidate.isBlank()) {
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
        ZoneId zone = (defaultZone != null) ? defaultZone : ZoneOffset.UTC;
        try {
            if (value.endsWith("Z") && value.length() == 16 && value.charAt(8) == 'T') {
                LocalDateTime ldt = LocalDateTime.parse(value.substring(0, value.length() - 1), ICAL_LOCAL_DT_FORMAT);
                return ldt.atOffset(ZoneOffset.UTC);
            }
            if (value.length() == 8 && value.chars().allMatch(Character::isDigit)) {
                LocalDate date = LocalDate.parse(value, ICAL_DATE_FORMAT);
                LocalDateTime ldt = endOfDayIfDateOnly ? date.atTime(23, 59, 59) : date.atStartOfDay();
                return ldt.atZone(zone).toOffsetDateTime();
            }
            if (value.length() == 15 && value.charAt(8) == 'T') {
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
            if (ts != null) {
                unique.putIfAbsent(ts.toInstant(), ts);
            }
        }
        return new ArrayList<>(unique.values());
    }
}
