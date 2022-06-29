// servicehandler.tsx
// copyright (c) 2021 Henrik Bechmann, Toronto, Licence: MIT

export default class ServiceHandler {

    constructor(cradleParameters) {

       this.cradleParameters = cradleParameters

       this.serviceCalls = cradleParameters.externalCallbacksRef.current

    }

    private cradleParameters

    public serviceCalls

    // TODO: adjust axisPixelOffset to match new data
    public reload = () => {

        // console.log('calling reload state from serviceHandler')

        // const { signals } = this.cradleParameters.handlersRef.current.interruptHandler
        const { stateHandler } = this.cradleParameters.handlersRef.current

        const { interruptHandler } = this.cradleParameters.handlersRef.current

        interruptHandler.pauseInterrupts()
        // signals.pauseCradleIntersectionObserver = true
        // signals.pauseTriggerlinesObserver = true
        // signals.pauseScrollingEffects = true
        stateHandler.setCradleState('reload')

    }


    public clearCache = () => {

        const { stateHandler } = this.cradleParameters.handlersRef.current

        stateHandler.setCradleState('clearcache')

    }

    public scrollToItem = (index) => {

        // console.log('calling scrollToItem: index', index)

        const { signals } = this.cradleParameters.handlersRef.current.interruptHandler
        const { scaffoldHandler, stateHandler} = this.cradleParameters.handlersRef.current

        signals.pauseScrollingEffects = true

        scaffoldHandler.cradlePositionData.targetAxisReferenceIndex = index

        stateHandler.setCradleState('doreposition')

    }

}

