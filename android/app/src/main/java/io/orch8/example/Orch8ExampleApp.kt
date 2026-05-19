package io.orch8.example

import android.app.Application
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner

class Orch8ExampleApp : Application() {
    lateinit var orch8Manager: Orch8Manager
        private set

    override fun onCreate() {
        super.onCreate()
        orch8Manager = Orch8Manager(this)
        orch8Manager.registerBatteryReceiver()

        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStart(owner: LifecycleOwner) {
                orch8Manager.resumeEngine()
            }

            override fun onStop(owner: LifecycleOwner) {
                orch8Manager.pauseEngine()
            }

            override fun onDestroy(owner: LifecycleOwner) {
                orch8Manager.destroy()
            }
        })
    }
}
