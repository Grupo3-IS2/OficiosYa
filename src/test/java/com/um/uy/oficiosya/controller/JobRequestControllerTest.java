package com.um.uy.oficiosya.controller;

import com.um.uy.oficiosya.dto.request.JobRequestAcceptRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCompleteRequest;
import com.um.uy.oficiosya.dto.request.JobRequestCreateRequest;
import com.um.uy.oficiosya.dto.request.JobRequestReviewRequest;
import com.um.uy.oficiosya.dto.response.JobRequestResponse;
import com.um.uy.oficiosya.entity.JobStatus;
import com.um.uy.oficiosya.exception.GlobalExceptionHandler;
import com.um.uy.oficiosya.service.interfaces.JobRequestService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Each job endpoint acts as the caller identified by the token. */
class JobRequestControllerTest {

    private static final String BASE = "/api/v1/job-requests";

    @Mock
    private JobRequestService jobRequestService;

    private MockMvc mvc;
    private final UUID userId = UUID.randomUUID();
    private final Authentication authentication =
            new UsernamePasswordAuthenticationToken(userId.toString(), "n/a", List.of());

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        mvc = MockMvcBuilders
                .standaloneSetup(new JobRequestController(jobRequestService))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    private MockHttpServletRequestBuilder signedIn(MockHttpServletRequestBuilder request, String body) {
        return request.principal(authentication).contentType(MediaType.APPLICATION_JSON).content(body);
    }

    private JobRequestResponse job(JobStatus status) {
        JobRequestResponse response = new JobRequestResponse();
        response.setId(10L);
        response.setStatus(status);
        response.setProfessionalName("Juan Pérez");
        response.setProfessionalProfileImageUrl("/uploads/juan.jpg");
        return response;
    }

    @Test
    void createJobRequest_answers201WithItsLocationAndThePin() throws Exception {
        JobRequestResponse created = job(JobStatus.PROPOSED);
        created.setConfirmationPin("123456");
        when(jobRequestService.createJobRequest(any(JobRequestCreateRequest.class), eq(userId))).thenReturn(created);

        mvc.perform(signedIn(post(BASE), """
                        {"professionalId":"%s","location":"Montevideo","paymentAmount":500,
                         "tasks":[{"tradeId":1,"description":"Arreglar la canilla"}]}""".formatted(UUID.randomUUID())))
                .andExpect(status().isCreated())
                .andExpect(header().string("Location", "http://localhost/api/v1/job-requests/10"))
                .andExpect(jsonPath("$.confirmationPin").value("123456"));
    }

    @Test
    void createJobRequest_withoutTasks_is400() throws Exception {
        mvc.perform(signedIn(post(BASE), """
                        {"professionalId":"%s","location":"Montevideo","paymentAmount":500,"tasks":[]}"""
                        .formatted(UUID.randomUUID())))
                .andExpect(status().isBadRequest());
    }

    @Test
    void acceptJobRequest() throws Exception {
        when(jobRequestService.acceptJobRequest(eq(10L), any(JobRequestAcceptRequest.class), eq(userId)))
                .thenReturn(job(JobStatus.ACCEPTED));

        mvc.perform(signedIn(post(BASE + "/10/accept"), """
                        {"startTimestamp":"2030-01-01T10:00:00-03:00","endTimestamp":"2030-01-01T12:00:00-03:00"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ACCEPTED"));
    }

    @Test
    void rejectJobRequest() throws Exception {
        when(jobRequestService.rejectJobRequest(10L, userId)).thenReturn(job(JobStatus.REJECTED));

        mvc.perform(signedIn(post(BASE + "/10/reject"), ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"));
    }

    @Test
    void cancelJobRequest() throws Exception {
        when(jobRequestService.cancelJobRequest(10L, userId)).thenReturn(job(JobStatus.CANCELLED));

        mvc.perform(signedIn(post(BASE + "/10/cancel"), ""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("CANCELLED"));
    }

    @Test
    void completeJobRequest() throws Exception {
        when(jobRequestService.completeJobRequest(eq(10L), any(JobRequestCompleteRequest.class), eq(userId)))
                .thenReturn(job(JobStatus.COMPLETED));

        mvc.perform(signedIn(post(BASE + "/10/complete"), """
                        {"pin":"123456"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"));
    }

    @Test
    void reviewJobRequest() throws Exception {
        JobRequestResponse reviewed = job(JobStatus.COMPLETED);
        reviewed.setRating(9);
        when(jobRequestService.reviewJobRequest(eq(10L), any(JobRequestReviewRequest.class), eq(userId)))
                .thenReturn(reviewed);

        mvc.perform(signedIn(post(BASE + "/10/review"), """
                        {"rating":9,"review":"Excelente"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.rating").value(9));
    }

    @Test
    void getJobRequest() throws Exception {
        when(jobRequestService.getJobRequest(10L, userId)).thenReturn(job(JobStatus.PROPOSED));

        mvc.perform(get(BASE + "/10").principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(10));
    }

    @Test
    void getMyJobRequests() throws Exception {
        when(jobRequestService.getMyJobRequests(userId)).thenReturn(List.of(job(JobStatus.PROPOSED)));

        mvc.perform(get(BASE + "/mine").principal(authentication))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].professionalName").value("Juan Pérez"))
                .andExpect(jsonPath("$[0].professionalProfileImageUrl").value("/uploads/juan.jpg"));
    }
}
