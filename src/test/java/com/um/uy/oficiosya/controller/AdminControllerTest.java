package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.TradeCreateRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.dto.response.ProfessionalResponse;
import com.um.uy.oficiosya.dto.response.ScheduleResponse;
import com.um.uy.oficiosya.dto.response.TradeResponse;
import com.um.uy.oficiosya.dto.response.UserResponse;
import com.um.uy.oficiosya.exception.GlobalExceptionHandler;
import com.um.uy.oficiosya.service.interfaces.ClientService;
import com.um.uy.oficiosya.service.interfaces.JobRequestService;
import com.um.uy.oficiosya.service.interfaces.ProfessionalService;
import com.um.uy.oficiosya.service.interfaces.ScheduleService;
import com.um.uy.oficiosya.service.interfaces.TradeService;
import com.um.uy.oficiosya.service.interfaces.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** The admin endpoints list everything on the platform and manage the trade catalog. */
class AdminControllerTest {

    private static final String BASE = "/api/v1/admin";

    @Mock
    private UserService userService;
    @Mock
    private ClientService clientService;
    @Mock
    private ProfessionalService professionalService;
    @Mock
    private TradeService tradeService;
    @Mock
    private JobRequestService jobRequestService;
    @Mock
    private ScheduleService scheduleService;

    private MockMvc mvc;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        mvc = MockMvcBuilders
                .standaloneSetup(new AdminController(userService, clientService, professionalService, tradeService,
                        jobRequestService, scheduleService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void listings_returnWhatTheServicesHave() throws Exception {
        when(userService.listUsers()).thenReturn(List.of(new UserResponse(), new UserResponse()));
        when(clientService.listClients()).thenReturn(List.of(new UserResponse()));
        when(professionalService.listProfessionals()).thenReturn(List.of(new ProfessionalResponse()));
        when(jobRequestService.listAllJobRequests()).thenReturn(List.of(new JobRequestResponse()));
        when(scheduleService.listAllSchedules()).thenReturn(List.of(new ScheduleResponse(), new ScheduleResponse()));

        mvc.perform(get(BASE + "/users")).andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get(BASE + "/clients")).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get(BASE + "/professionals")).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get(BASE + "/job-requests")).andExpect(jsonPath("$.length()").value(1));
        mvc.perform(get(BASE + "/schedules")).andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void createTrade_answers201() throws Exception {
        when(tradeService.createTrade(any(TradeCreateRequest.class))).thenReturn(new TradeResponse(1L, "Plomería"));

        mvc.perform(post(BASE + "/trades").contentType(MediaType.APPLICATION_JSON).content("""
                        {"name":"Plomería"}"""))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Plomería"));
    }

    @Test
    void createTrade_withoutName_is400() throws Exception {
        mvc.perform(post(BASE + "/trades").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest());
    }
}
