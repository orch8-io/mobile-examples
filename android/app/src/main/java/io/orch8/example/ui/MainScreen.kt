package io.orch8.example.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import io.orch8.example.ApprovalRequest
import io.orch8.example.BannerInfo
import io.orch8.example.BannerStyle
import io.orch8.example.Orch8Manager
import io.orch8.example.WorkflowStatus
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainScreen(manager: Orch8Manager) {
    val activeBanner by manager.activeBanner.collectAsState()
    val pendingApproval by manager.pendingApproval.collectAsState()
    val activeWorkflows by manager.activeWorkflows.collectAsState()
    val completedWorkflows by manager.completedWorkflows.collectAsState()
    val engineReady by manager.engineReady.collectAsState()
    val loadedSequenceNames by manager.loadedSequenceNames.collectAsState()
    val engineInfo by manager.engineInfo.collectAsState()

    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { Text("orch8 Examples") },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.primaryContainer
                    )
                )
            }
        ) { padding ->
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                if (engineInfo.isNotEmpty()) {
                    item {
                        EngineInfoCard(engineInfo = engineInfo, sequenceCount = loadedSequenceNames.size)
                    }
                }

                item {
                    Text(
                        "Start a Workflow",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                }

                items(manager.workflows) { wf ->
                    WorkflowLaunchCard(
                        displayName = wf.displayName,
                        description = wf.description,
                        icon = iconFor(wf.name),
                        color = colorFor(wf.name),
                        enabled = engineReady,
                        onClick = {
                            manager.startWorkflow(wf.name, sampleInput(wf.name))
                        }
                    )
                }

                if (activeWorkflows.isNotEmpty()) {
                    item {
                        Text(
                            "Active",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)
                        )
                    }
                    items(activeWorkflows) { wf ->
                        WorkflowStatusCard(workflow = wf) {
                            manager.cancelWorkflow(wf.id)
                        }
                    }
                }

                if (completedWorkflows.isNotEmpty()) {
                    item {
                        Text(
                            "History",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(top = 16.dp, bottom = 8.dp)
                        )
                    }
                    items(completedWorkflows) { wf ->
                        WorkflowStatusCard(workflow = wf, onCancel = null)
                    }
                }
            }
        }

        AnimatedVisibility(
            visible = activeBanner != null,
            enter = slideInVertically { -it },
            exit = slideOutVertically { -it },
            modifier = Modifier.align(Alignment.TopCenter)
        ) {
            activeBanner?.let { banner ->
                BannerCard(banner = banner) { manager.dismissBanner() }

                LaunchedEffect(banner.id) {
                    delay(5000)
                    manager.dismissBanner()
                }
            }
        }

        pendingApproval?.let { approval ->
            ApprovalDialog(approval = approval) { decision ->
                manager.resolveApproval(decision)
            }
        }
    }
}

@Composable
private fun EngineInfoCard(engineInfo: String, sequenceCount: Int) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.secondaryContainer
        )
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Filled.Memory,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onSecondaryContainer,
                modifier = Modifier.size(20.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Column {
                Text(
                    engineInfo,
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSecondaryContainer
                )
                Text(
                    "$sequenceCount sequences loaded",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer.copy(alpha = 0.7f)
                )
            }
        }
    }
}

@Composable
private fun WorkflowLaunchCard(
    displayName: String,
    description: String,
    icon: ImageVector,
    color: Color,
    enabled: Boolean,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = color,
                modifier = Modifier.size(36.dp)
            )
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(displayName, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                Text(description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Icon(
                imageVector = Icons.Filled.PlayArrow,
                contentDescription = "Start",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(28.dp)
            )
        }
    }
}

@Composable
private fun WorkflowStatusCard(workflow: WorkflowStatus, onCancel: (() -> Unit)?) {
    val stateColor = stateColor(workflow.state)
    var expanded by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .animateContentSize()
            .clickable { expanded = !expanded },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
    ) {
        Column {
            Row(
                modifier = Modifier.padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Box(
                    modifier = Modifier
                        .size(10.dp)
                        .clip(CircleShape)
                        .background(stateColor)
                )
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(workflow.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
                    workflow.currentStep?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = stateColor.copy(alpha = 0.15f)
                ) {
                    Text(
                        workflow.state,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = stateColor
                    )
                }
                if (onCancel != null && workflow.state in listOf("Scheduled", "Running", "Waiting")) {
                    IconButton(onClick = onCancel, modifier = Modifier.size(32.dp)) {
                        Icon(Icons.Filled.Close, contentDescription = "Cancel", tint = Color.Red, modifier = Modifier.size(16.dp))
                    }
                }
            }

            if (expanded) {
                HorizontalDivider(modifier = Modifier.padding(horizontal = 12.dp))
                Column(modifier = Modifier.padding(12.dp)) {
                    DetailRow("Instance ID", workflow.id)
                    workflow.dedupKey?.let { DetailRow("Dedup Key", it) }
                    DetailRow("State", workflow.state)
                    workflow.currentStep?.let { DetailRow("Current Step", it) }
                    workflow.createdAt?.let { DetailRow("Created", it) }
                    DetailRow("Updated", workflow.updatedAt)
                }
            }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 2.dp)
    ) {
        Text(
            label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(100.dp)
        )
        Text(
            value,
            style = MaterialTheme.typography.bodySmall,
            fontFamily = FontFamily.Monospace,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun BannerCard(banner: BannerInfo, onDismiss: () -> Unit) {
    val bgColor = when (banner.style) {
        BannerStyle.SUCCESS -> Color(0xFF4CAF50)
        BannerStyle.ERROR -> Color(0xFFF44336)
        BannerStyle.WARNING -> Color(0xFFFF9800)
        BannerStyle.INFO -> Color(0xFF2196F3)
    }
    val icon = when (banner.style) {
        BannerStyle.SUCCESS -> Icons.Filled.CheckCircle
        BannerStyle.ERROR -> Icons.Filled.Error
        BannerStyle.WARNING -> Icons.Filled.Warning
        BannerStyle.INFO -> Icons.Filled.Info
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
            .statusBarsPadding(),
        colors = CardDefaults.cardColors(containerColor = bgColor),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.Top
        ) {
            Icon(icon, contentDescription = null, tint = Color.White, modifier = Modifier.size(24.dp))
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(banner.title, style = MaterialTheme.typography.titleSmall, color = Color.White, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(2.dp))
                Text(banner.message, style = MaterialTheme.typography.bodySmall, color = Color.White.copy(alpha = 0.9f), maxLines = 3)
            }
            IconButton(onClick = onDismiss, modifier = Modifier.size(24.dp)) {
                Icon(Icons.Filled.Close, contentDescription = "Dismiss", tint = Color.White.copy(alpha = 0.8f), modifier = Modifier.size(16.dp))
            }
        }
    }
}

@Composable
private fun ApprovalDialog(approval: ApprovalRequest, onDecision: (String) -> Unit) {
    Dialog(onDismissRequest = {}) {
        Card(shape = RoundedCornerShape(20.dp)) {
            Column(
                modifier = Modifier.padding(24.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    Icons.Filled.HelpOutline,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(48.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                Text("Approval Required", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    approval.prompt,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "Instance: ${approval.instanceId.take(8)}...",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(20.dp))

                approval.choices.forEach { (label, value) ->
                    val btnColor = when (value) {
                        "approved", "accepted", "consented" -> Color(0xFF4CAF50)
                        "rejected", "declined", "denied" -> Color(0xFFF44336)
                        else -> MaterialTheme.colorScheme.primary
                    }
                    Button(
                        onClick = { onDecision(value) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = btnColor)
                    ) {
                        Text(label, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

private fun iconFor(name: String): ImageVector = when (name) {
    "onboarding-flow" -> Icons.Filled.PersonAdd
    "payment-verification" -> Icons.Filled.CreditCard
    "feature-access" -> Icons.Filled.LockOpen
    else -> Icons.Filled.Settings
}

private fun colorFor(name: String): Color = when (name) {
    "onboarding-flow" -> Color(0xFF2196F3)
    "payment-verification" -> Color(0xFF4CAF50)
    "feature-access" -> Color(0xFF9C27B0)
    else -> Color.Gray
}

private fun stateColor(state: String): Color = when (state) {
    "Scheduled" -> Color(0xFF2196F3)
    "Running" -> Color(0xFFFF9800)
    "Waiting" -> Color(0xFFFFC107)
    "Completed" -> Color(0xFF4CAF50)
    "Failed" -> Color(0xFFF44336)
    "Cancelled" -> Color.Gray
    else -> Color.Gray
}

private fun sampleInput(name: String): Map<String, Any> = when (name) {
    "onboarding-flow" -> mapOf(
        "user_email" to "alice@example.com",
        "user_name" to "Alice Johnson",
        "signup_source" to "referral",
        "tier" to "premium"
    )
    "payment-verification" -> mapOf(
        "amount" to 249.99,
        "currency" to "USD",
        "merchant" to "Orch8 Store",
        "customer_email" to "alice@example.com",
        "items" to 3
    )
    "feature-access" -> mapOf(
        "user_id" to "usr_alice_001",
        "feature" to "premium_analytics",
        "current_tier" to "free",
        "account_age_days" to 90
    )
    else -> emptyMap()
}
