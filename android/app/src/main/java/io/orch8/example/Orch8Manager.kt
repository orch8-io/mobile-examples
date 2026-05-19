package io.orch8.example

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import io.orch8.mobile.DeviceContext
import io.orch8.mobile.EngineListener
import io.orch8.mobile.InstanceSummary
import io.orch8.mobile.MobileEngine
import io.orch8.mobile.MobileEngineConfig
import io.orch8.mobile.PowerState
import io.orch8.mobile.SequenceInfo
import io.orch8.mobile.StepHandler
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

data class BannerInfo(
    val id: String = UUID.randomUUID().toString(),
    val title: String,
    val message: String,
    val style: BannerStyle
)

enum class BannerStyle {
    SUCCESS, ERROR, WARNING, INFO
}

data class ApprovalRequest(
    val id: String = UUID.randomUUID().toString(),
    val instanceId: String,
    val stepName: String,
    val prompt: String,
    val choices: List<Pair<String, String>>
)

data class WorkflowStatus(
    val id: String,
    val name: String,
    var state: String,
    var currentStep: String? = null,
    var updatedAt: String = "",
    val dedupKey: String? = null,
    val createdAt: String? = null
)

data class WorkflowDefinition(
    val name: String,
    val displayName: String,
    val description: String,
)

class Orch8Manager(private val context: Context) {
    companion object {
        private const val SEQUENCES_URL = "http://10.0.2.2:8080/sequences.json"
        private const val PREFS_NAME = "orch8_prefs"
        private const val KEY_DEVICE_ID = "device_id"
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var engine: MobileEngine? = null

    private val _activeBanner = MutableStateFlow<BannerInfo?>(null)
    val activeBanner: StateFlow<BannerInfo?> = _activeBanner.asStateFlow()

    private val _pendingApproval = MutableStateFlow<ApprovalRequest?>(null)
    val pendingApproval: StateFlow<ApprovalRequest?> = _pendingApproval.asStateFlow()

    private val _activeWorkflows = MutableStateFlow<List<WorkflowStatus>>(emptyList())
    val activeWorkflows: StateFlow<List<WorkflowStatus>> = _activeWorkflows.asStateFlow()

    private val _completedWorkflows = MutableStateFlow<List<WorkflowStatus>>(emptyList())
    val completedWorkflows: StateFlow<List<WorkflowStatus>> = _completedWorkflows.asStateFlow()

    private val _engineReady = MutableStateFlow(false)
    val engineReady: StateFlow<Boolean> = _engineReady.asStateFlow()

    private val _loadedSequenceNames = MutableStateFlow<List<String>>(emptyList())
    val loadedSequenceNames: StateFlow<List<String>> = _loadedSequenceNames.asStateFlow()

    private val _engineInfo = MutableStateFlow("")
    val engineInfo: StateFlow<String> = _engineInfo.asStateFlow()

    val workflows = listOf(
        WorkflowDefinition(
            "onboarding-flow", "User Onboarding",
            "10 steps — email validation, terms acceptance (wait), preferences (wait), notifications (wait), admin approval (wait), conditional routing, success/rejection banners",
        ),
        WorkflowDefinition(
            "payment-verification", "Payment Verification",
            "10 steps — amount validation, fraud check, risk assessment, compliance, payment approval (wait), conditional routing, success banner + receipt or rejection banner",
        ),
        WorkflowDefinition(
            "feature-access", "Feature Access Control",
            "10 steps — eligibility, config, rules, consent (wait), identity verification, access approval (wait), dual routing, access granted or denied/limited banners",
        ),
    )

    private val batteryReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent?.action != Intent.ACTION_BATTERY_CHANGED) return
            val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            if (level < 0 || scale <= 0) return
            val pct = (level * 100) / scale

            val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            val isCharging = status == BatteryManager.BATTERY_STATUS_CHARGING
                    || status == BatteryManager.BATTERY_STATUS_FULL

            val powerState = when {
                isCharging -> PowerState.CHARGING
                pct > 20 -> PowerState.UNPLUGGED
                pct >= 5 -> PowerState.LOW_BATTERY
                else -> PowerState.CRITICAL_BATTERY
            }
            reportPowerState(powerState)
        }
    }

    init {
        scope.launch(Dispatchers.IO) { setupEngine() }
    }

    private fun getOrCreateDeviceId(): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        var deviceId = prefs.getString(KEY_DEVICE_ID, null)
        if (deviceId == null) {
            deviceId = "android-${UUID.randomUUID()}"
            prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
        }
        return deviceId
    }

    private fun setupEngine() {
        val dbPath = context.getDatabasePath("orch8-example.db").absolutePath

        val tickIntervalMs: ULong = 200u
        val maxConcurrentSteps: UInt = 4u
        val maxConcurrentInstances: UInt = 10u

        val config = MobileEngineConfig(
            tickIntervalMs = tickIntervalMs,
            maxConcurrentSteps = maxConcurrentSteps,
            maxStepsPerInstance = 1000u,
            maxConcurrentInstances = maxConcurrentInstances,
            maxTickDurationMs = 5000u,
            maxInstanceLifetimeSecs = 86400u,
            maxStoredSequences = 50u,
            maxSequenceSizeBytes = 1_048_576u,
            handlerTimeoutMs = 30000u,
            operationTimeoutMs = 10000u,
            telemetryEnabled = true,
            environment = "development",
            rootPublicKey = "",
            sdkVersion = "0.1.0",
            memoryBudgetBytes = 0u,
            sequencesUrl = SEQUENCES_URL
        )

        try {
            val eng = MobileEngine(dbPath, config)
            registerHandlers(eng)
            eng.setListener(ExampleListener())

            try {
                val count = eng.loadSequencesFromUrl("")
                android.util.Log.i("Orch8Manager", "Loaded $count sequences from $SEQUENCES_URL")
            } catch (e: Exception) {
                android.util.Log.e("Orch8Manager", "Failed to load sequences from URL", e)
            }

            eng.setDeviceContext(DeviceContext(
                deviceId = getOrCreateDeviceId(),
                osName = "Android",
                osVersion = android.os.Build.VERSION.RELEASE,
                appVersion = "1.0.0",
                sdkVersion = "0.1.0"
            ))

            engine = eng

            scope.launch(Dispatchers.Main) {
                _engineReady.value = true
                _engineInfo.value = "tick=${tickIntervalMs}ms | workers=$maxConcurrentSteps | maxInstances=$maxConcurrentInstances"
            }

            refreshLoadedSequences()
            eng.resume()
        } catch (e: Exception) {
            android.util.Log.e("Orch8Manager", "Failed to initialize engine", e)
        }
    }

    private fun refreshLoadedSequences() {
        val eng = engine ?: return
        try {
            val sequences = eng.loadedSequences()
            scope.launch(Dispatchers.Main) {
                _loadedSequenceNames.value = sequences.map { "${it.name} v${it.version}" }
            }
        } catch (e: Exception) {
            android.util.Log.e("Orch8Manager", "Failed to list loaded sequences", e)
        }
    }

    private fun registerHandlers(engine: MobileEngine) {
        val handlers = mapOf<String, (String, String) -> String>(
            "init_profile" to { _, _ ->
                val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(Date())
                """{"status":"profile_initialized","timestamp":"$timestamp"}"""
            },
            "validate_email" to { _, _ -> """{"valid":true,"email":"user@example.com"}""" },
            "show_terms" to { _, _ -> """{"shown":true}""" },
            "collect_preferences" to { _, _ -> """{"collected":true}""" },
            "setup_notifications" to { _, _ -> """{"configured":true}""" },
            "request_approval" to { _, _ -> """{"requested":true}""" },
            "complete_onboarding" to { _, _ -> """{"completed":true}""" },
            "init_payment" to { _, _ -> """{"payment_id":"PAY-${UUID.randomUUID().toString().take(8)}","status":"initialized"}""" },
            "validate_amount" to { _, _ -> """{"valid":true,"amount":99.99}""" },
            "fraud_check" to { _, _ -> """{"passed":true,"score":0.15}""" },
            "risk_assessment" to { _, _ -> """{"risk_level":"low","score":0.2}""" },
            "compliance_check" to { _, _ -> """{"compliant":true,"checks":["AML","KYC"]}""" },
            "process_payment" to { _, _ -> """{"processed":true,"transaction_id":"TXN-001"}""" },
            "send_receipt" to { _, _ -> """{"receipt_sent":true}""" },
            "check_eligibility" to { _, _ -> """{"eligible":true}""" },
            "fetch_feature_config" to { _, _ -> """{"feature":"premium_analytics","available":true}""" },
            "evaluate_rules" to { _, _ -> """{"rules_passed":true}""" },
            "request_consent" to { _, _ -> """{"consent_shown":true}""" },
            "verify_identity" to { _, _ -> """{"verified":true,"method":"biometric"}""" },
            "activate_feature" to { _, _ -> """{"activated":true,"feature":"premium_analytics"}""" },
            "show_banner" to { _, input ->
                try {
                    val params = JSONObject(input)
                    val title = params.optString("title", "Notice")
                    val message = params.optString("message", "")
                    val styleStr = params.optString("style", "info")
                    val style = when (styleStr) {
                        "success" -> BannerStyle.SUCCESS
                        "error" -> BannerStyle.ERROR
                        "warning" -> BannerStyle.WARNING
                        else -> BannerStyle.INFO
                    }
                    scope.launch(Dispatchers.Main) {
                        _activeBanner.value = BannerInfo(title = title, message = message, style = style)
                    }
                } catch (_: Exception) {}
                """{"banner_shown":true}"""
            }
        )

        for ((name, handler) in handlers) {
            engine.registerHandler(name, object : StepHandler {
                override fun execute(stepName: String, input: String): String {
                    return handler(stepName, input)
                }
            })
        }
    }

    fun startWorkflow(name: String, input: Map<String, Any> = emptyMap()) {
        val eng = engine ?: return
        val inputJson = JSONObject(input).toString()
        val dedupKey = "$name-${UUID.randomUUID().toString().take(8)}"
        scope.launch(Dispatchers.IO) {
            try {
                val instanceId = eng.start(name, inputJson, dedupKey)
                val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(Date())
                val status = WorkflowStatus(
                    id = instanceId,
                    name = name,
                    state = "Scheduled",
                    updatedAt = timestamp,
                    dedupKey = dedupKey,
                    createdAt = timestamp
                )
                scope.launch(Dispatchers.Main) {
                    _activeWorkflows.value = _activeWorkflows.value + status
                }
                android.util.Log.i("Orch8Manager", "Started workflow '$name' instance=$instanceId dedup=$dedupKey")
            } catch (e: Exception) {
                android.util.Log.e("Orch8Manager", "Failed to start workflow '$name'", e)
                scope.launch(Dispatchers.Main) {
                    _activeBanner.value = BannerInfo(
                        title = "Error",
                        message = "Failed to start $name: ${e.message}",
                        style = BannerStyle.ERROR
                    )
                }
            }
        }
    }

    fun dismissBanner() {
        _activeBanner.value = null
    }

    fun resolveApproval(decision: String) {
        val approval = _pendingApproval.value ?: return
        val eng = engine ?: return
        _pendingApproval.value = null

        _activeWorkflows.value = _activeWorkflows.value.map { wf ->
            if (wf.id == approval.instanceId) wf.copy(state = "Running", currentStep = "Processing $decision...")
            else wf
        }

        scope.launch(Dispatchers.IO) {
            try {
                val output = JSONObject().put("value", decision).toString()
                eng.completeStep(approval.instanceId, approval.stepName, output)
            } catch (e: Exception) {
                android.util.Log.e("Orch8Manager", "Failed to resolve approval", e)
            }
        }
    }

    fun cancelWorkflow(instanceId: String) {
        val eng = engine ?: return
        _activeWorkflows.value = _activeWorkflows.value.filter { it.id != instanceId }

        scope.launch(Dispatchers.IO) {
            try {
                eng.cancelInstance(instanceId)
            } catch (e: Exception) {
                android.util.Log.e("Orch8Manager", "Failed to cancel workflow", e)
            }
        }
    }

    fun resumeEngine() {
        engine?.resume()
        android.util.Log.i("Orch8Manager", "Engine resumed")
    }

    fun pauseEngine() {
        engine?.pause()
        android.util.Log.i("Orch8Manager", "Engine paused")
    }

    fun shutdownEngine() {
        engine?.let { eng ->
            eng.flushTelemetry()
            eng.shutdown()
        }
        engine = null
        android.util.Log.i("Orch8Manager", "Engine shut down")
    }

    fun destroy() {
        unregisterBatteryReceiver()
        shutdownEngine()
        scope.cancel()
    }

    fun reportPowerState(state: PowerState) {
        engine?.reportPowerState(state)
        android.util.Log.d("Orch8Manager", "Reported power state: $state")
    }

    fun onPushReceived() {
        engine?.onPushReceived()
        android.util.Log.i("Orch8Manager", "Push received — forced immediate sync")
    }

    fun getLoadedSequences(): List<SequenceInfo> {
        return engine?.loadedSequences() ?: emptyList()
    }

    fun getInstanceDetail(instanceId: String): InstanceSummary? {
        return try {
            engine?.getInstance(instanceId)
        } catch (e: Exception) {
            android.util.Log.e("Orch8Manager", "Failed to get instance detail", e)
            null
        }
    }

    fun registerBatteryReceiver() {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        context.registerReceiver(batteryReceiver, filter)
        android.util.Log.i("Orch8Manager", "Battery receiver registered")
    }

    fun unregisterBatteryReceiver() {
        try {
            context.unregisterReceiver(batteryReceiver)
        } catch (_: IllegalArgumentException) {
            // Receiver was not registered
        }
    }

    private inner class ExampleListener : EngineListener {
        override fun onInstanceCompleted(instanceId: String, output: String) {
            scope.launch(Dispatchers.Main) {
                val workflow = _activeWorkflows.value.find { it.id == instanceId }
                if (workflow != null) {
                    _activeWorkflows.value = _activeWorkflows.value.filter { it.id != instanceId }
                    val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(Date())
                    _completedWorkflows.value = listOf(
                        workflow.copy(state = "Completed", updatedAt = timestamp)
                    ) + _completedWorkflows.value
                }
            }
        }

        override fun onInstanceFailed(instanceId: String, error: String) {
            scope.launch(Dispatchers.Main) {
                val workflow = _activeWorkflows.value.find { it.id == instanceId }
                if (workflow != null) {
                    _activeWorkflows.value = _activeWorkflows.value.filter { it.id != instanceId }
                    val timestamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).format(Date())
                    _completedWorkflows.value = listOf(
                        workflow.copy(state = "Failed", updatedAt = timestamp)
                    ) + _completedWorkflows.value
                }
                _activeBanner.value = BannerInfo(
                    title = "Workflow Failed",
                    message = error,
                    style = BannerStyle.ERROR
                )
            }
        }

        override fun onStepPending(instanceId: String, stepName: String, handler: String) {
            scope.launch(Dispatchers.Main) {
                _activeWorkflows.value = _activeWorkflows.value.map { wf ->
                    if (wf.id == instanceId) wf.copy(state = "Waiting", currentStep = stepName)
                    else wf
                }

                when (handler) {
                    "request_approval" -> {
                        _pendingApproval.value = ApprovalRequest(
                            instanceId = instanceId,
                            stepName = stepName,
                            prompt = "Action requires approval. Please review and decide.",
                            choices = listOf("Approve" to "approved", "Reject" to "rejected")
                        )
                    }
                    "show_terms" -> {
                        _pendingApproval.value = ApprovalRequest(
                            instanceId = instanceId,
                            stepName = stepName,
                            prompt = "Please review and accept the Terms of Service.",
                            choices = listOf("Accept" to "accepted", "Decline" to "declined")
                        )
                    }
                    "request_consent" -> {
                        _pendingApproval.value = ApprovalRequest(
                            instanceId = instanceId,
                            stepName = stepName,
                            prompt = "This feature collects usage data. Do you consent?",
                            choices = listOf("I Agree" to "consented", "No Thanks" to "declined")
                        )
                    }
                    "collect_preferences", "setup_notifications" -> {
                        val eng = engine ?: return@launch
                        val output = when (handler) {
                            "collect_preferences" -> """{"value":"tech,news"}"""
                            else -> """{"value":"enabled"}"""
                        }
                        scope.launch(Dispatchers.IO) {
                            try {
                                eng.completeStep(instanceId, stepName, output)
                            } catch (e: Exception) {
                                android.util.Log.e("Orch8Manager", "Failed to auto-complete step $stepName", e)
                            }
                        }
                    }
                }
            }
        }
    }
}
