package io.orch8.example

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import io.orch8.example.ui.theme.Orch8ExampleTheme
import io.orch8.example.ui.MainScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val manager = (application as Orch8ExampleApp).orch8Manager

        handleIntent(intent, manager)

        setContent {
            Orch8ExampleTheme {
                Surface(
                    modifier = Modifier.fillMaxSize(),
                    color = MaterialTheme.colorScheme.background
                ) {
                    MainScreen(manager = manager)
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val manager = (application as Orch8ExampleApp).orch8Manager
        handleIntent(intent, manager)
    }

    private fun handleIntent(intent: Intent, manager: Orch8Manager) {
        // Deep link: orch8://start/{workflow-name}
        val data = intent.data
        if (data != null && data.scheme == "orch8" && data.host == "start") {
            val workflowName = data.pathSegments.firstOrNull()
            if (workflowName != null) {
                android.util.Log.i("MainActivity", "Deep link start: $workflowName")
                manager.startWorkflow(workflowName)
            }
        }

        // Push notification tap (stub — expects "instance_id" extra)
        val pushInstanceId = intent.getStringExtra("orch8_instance_id")
        if (pushInstanceId != null) {
            android.util.Log.i("MainActivity", "Opened from push for instance: $pushInstanceId")
            manager.onPushReceived()
        }
    }
}
