package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.ScheduleCreateRequest;
import com.um.uy.oficiosya.dto.response.ScheduleResponse;
import com.um.uy.oficiosya.dto.update.ScheduleUpdateRequest;
import com.um.uy.oficiosya.entity.ScheduleType;
import com.um.uy.oficiosya.exception.GlobalExceptionHandler;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The agenda endpoints: the caller edits their own blocks, and anyone can read a professional's agenda. */
class ScheduleControllerTest {

    private static final String BASE = "/api/v1/schedules";

    @Mock
    private ScheduleService scheduleService;

    private MockMvc mvc;
    private final UUID userId = UUID.randomUUID();
    private final Authentication authentication =
            new UsernamePasswordAuthenticationToken(userId.toString(), "n/a", List.of());

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        mvc = MockMvcBuilders
                .standaloneSetup(new ScheduleController(scheduleService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private ScheduleResponse block() {
        ScheduleResponse response = new ScheduleResponse();
        response.setId(5L);
        response.setType(ScheduleType.USER_RESERVED);
        return response;
    }

    @Test
    void createSchedule_answers201() throws Exception {
        when(scheduleService.createSchedule(any(ScheduleCreateRequest.class), eq(userId))).thenReturn(block());

        mvc.perform(post(BASE).principal(authentication).contentType(MediaType.APPLICATION_JSON).content("""
                        {"type":"USER_RESERVED","startTimestamp":"2030-01-01T10:00:00-03:00",
                         "endTimestamp":"2030-01-01T12:00:00-03:00"}"""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").value(5));
    }

    @Test
    void updateSchedule() throws Exception {
        when(scheduleService.updateSchedule(any(ScheduleUpdateRequest.class), eq(5L), eq(userId))).thenReturn(block());

        mvc.perform(patch(BASE + "/5").principal(authentication).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.type").value("USER_RESERVED"));
    }

    @Test
    void deleteSchedule_answers204() throws Exception {
        mvc.perform(delete(BASE + "/5").principal(authentication))
                .andExpect(status().isNoContent());

        verify(scheduleService).deleteSchedule(5L, userId);
    }

    @Test
    void getAgenda_ofTheCaller_isTheOwnersView() throws Exception {
        when(scheduleService.getAgenda(userId, null, null, true)).thenReturn(List.of(block()));

        mvc.perform(get(BASE).param("professionalId", userId.toString()).principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void getAgenda_anonymous_isThePublicView() throws Exception {
        UUID professionalId = UUID.randomUUID();
        when(scheduleService.getAgenda(eq(professionalId), any(), isNull(), eq(false))).thenReturn(List.of());

        mvc.perform(get(BASE).param("professionalId", professionalId.toString())
                        .param("from", "2030-01-01T00:00:00Z"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }
}
