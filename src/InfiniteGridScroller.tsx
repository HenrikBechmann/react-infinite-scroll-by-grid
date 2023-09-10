// InfiniteGridScroller.tsx
// copyright (c) 2019-2023 Henrik Bechmann, Toronto, Licence: MIT

/*
    react-infinite-grid-scroller = RIGS

    The job of InfiniteGridScroller is to pass parameters to dependents.
    Viewport contains the Scrollblock, which is full size for listsize of given cell height/width.
    Scrollblock in turn contains the Cradle - a component that contains CellFrames, which contain 
    displayed user content (items) or transitional placeholders. 

    Host content is instantiated in a cache of React portals (via cacheAPI). Content is then 
    portal'd to CellFrames. The cache can be configured to hold more items than the Cradle (limited by 
    device memory). Caching allows host content to maintain state.

    Scrollblock represents the entirety of the list (and is sized accordingly). It is the component that is scrolled.

    Cradle contains the list items, and is 'virtualized' -- it appears as though it scrolls through a filled 
    scrollblock, but in fact it is only slightly larger than the viewport. Content is rotated in and out of the 
    cradle through the cache.
    
    Individual host items are framed by CellFrame, which are managed by Cradle.

    Overall the InfiniteGridScroller as a package manages the asynchronous interactions of the 
    components of the mechanism. Most of the work occurs in the Cradle component.

    The RIGS liner (the top level Viewport element) is set with 'display:absolute' and 'inset:0', so the user 
    containing block should be styled accordingly.
*/

import React, { useEffect, useState, useCallback, useRef, useContext } from 'react'

import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { TouchBackend } from 'react-dnd-touch-backend'

const ismobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

const DndBackend = ismobile?TouchBackend:HTML5Backend

const hasNative =
  document && (document['elementsFromPoint'] || document['msElementsFromPoint'])

function getDropTargetElementsAtPoint(x, y, dropTargets) {
  return dropTargets.filter((t) => {
    const rect = t.getBoundingClientRect()
    return (
      x >= rect.left && x <= rect.right && y <= rect.bottom && y >= rect.top
    )
  })
}

// use custom function only if elementsFromPoint is not supported
const backendOptions = {
  getDropTargetElementsAtPoint: !hasNative && getDropTargetElementsAtPoint
}

// defensive
import { ErrorBoundary } from 'react-error-boundary' // www.npmjs.com/package/react-error-boundary

const isSafariIOSFn = () => {
    const
        is_ios = /iP(ad|od|hone)/i.test(window.navigator.userAgent),
        is_safari = !!navigator.userAgent.match(/Version\/[\d\.]+.*Safari/)
    return ( is_ios && is_safari ) 
}

export const isSafariIOS = isSafariIOSFn()

// based on module template
function ErrorFallback({error, resetErrorBoundary}) {
  return (
    <div role="alert" style = {{margin:'3px'}}>
      <p>Something went wrong inside react-infinite-grid-scroller. See the console for details.</p>
      <p>Click to cancel the error and try to continue.</p>
      <button 
          style = {{border:'1px solid black', margin:'3px', padding:'3px'}} 
          onClick = { resetErrorBoundary }
      >
          Cancel error
      </button>
    </div>
  )
}

// scroller components
import Viewport from './Viewport'
import Scrollblock from './Scrollblock'
import { CradleController } from './Cradle'

// loaded here to minimize redundant renders in Cradle
import PortalCache from './PortalCache'

// -------------------[ global session ID generator ]----------------

let globalScrollerID = 0

// -----------------[ Drag and drop option support ]---------------------

export const DndContext = React.createContext({dnd:false}) // inform children
export const ScrollerDndOptions = React.createContext(null)

// wrapper for Dnd provider
export const RigsDnd = (props) => { // must be loaded as root scroller by host to set up Dnd provider

    const dndContext = useContext(DndContext)

    if (!dndContext.dnd) dndContext.dnd = true

    return <DndProvider backend={DndBackend} options = {backendOptions}>
        <InfiniteGridScroller {...props} />
    </DndProvider>

}

// ===================================[ INITIALIZE ]===========================

const RIGSWrapper = (props) => { // default wrapper to set dnd context false

    const dndContext = useContext(DndContext)
    dndContext.dnd = false

    return <InfiniteGridScroller {...props} />

}

export default RIGSWrapper

const InfiniteGridScroller = (props) => {

    // state
    const [scrollerState, setScrollerState] = useState('setup') // setup, setlistprops, ready

    // ------------------[ normalize properties ]--------------------

    let { 

        // required
        cellHeight, // required. the outer pixel height - literal for vertical; approximate for horizontal
            // max for variable layout
        cellWidth, // required. the outer pixel width - literal for horizontal; approximate for vertical
            // max for variable layout
        startingListSize = 0, // the starging number of items in the virtual list. can be changed
        startingListRange = [], // supercedes startingListSize if present
        getItem, // required. function provided by host - parameters set by system are index number
            // and session itemID for tracking and matching; 
            // return value is host-selected component or promise of a component, or null or undefined
        getItemPack, // returns a simple object with item components: content, profile, options, dragText
        // grid specs:
        orientation = 'vertical', // vertical or horizontal
        gap = 0, // space between grid cells
        padding = 0, // the padding around the Scrollblock
        layout = 'uniform', // uniform, variable
        cellMinHeight = 25, // for layout == 'variable' && orientation == 'vertical'
        cellMinWidth = 25, // for layout == 'variable' && orientation == 'horizontal'

        // scroller specs:
        runwaySize = 3, // the number of rows outside the view of each side of the viewport 
            // -- gives time to assemble cellFrames before display
        startingIndex = 0, // the starting index of the list, when first loaded
        getExpansionCount, // optional, function provided by host, returns the number of indexes to add to
            // the virtual list when the scroller hits the start or end of the list

        // system specs:
        cache = 'cradle', // "preload", "keepload" or "cradle"
        cacheMax = null, // always minimum cradle content size; falsey means limited by listsize
        placeholder, // optional. a sparse component to stand in for content until the content arrives; 
            // replaces default placeholder if present
        usePlaceholder = true, // no placeholder rendered if false
        useScrollTracker = true, // the internal component to give feedback for repositioning

        // advanced objects
        styles = {}, // optional. passive style over-rides (eg. color, opacity); has 
            // properties viewport, scrollblock, cradle, scrolltracker, placeholderframe, 
            // placeholdererrorframe, placeholderliner or placeholdererrorliner. Do not make structural changes!
        placeholderMessages = {}, // messages presented by default placeholder. See documentation
        callbacks = {}, // optional. closures to get direct information streams of some component utilites
            // can contain functionsCallback, which provides access to internal scroller functions 
            //(mostly cache management)
        technical = {}, // optional. technical settings like VIEWPORT_RESIZE_TIMEOUT
        cacheAPI = null,
        dndOptions = {}, // placeholder!

        // information for host cell content
        scrollerProperties, // required for embedded scroller; shares scroller settings with content

    } = props

    const dndContext = useContext(DndContext)

    let isMinimalPropsFail = false
    if (!(cellWidth && cellHeight && (getItem || getItemPack) )) {
        console.log('RIGS: cellWidth, cellHeight, and getItem are required')
        isMinimalPropsFail = true
    }

    // ---------------------[ Data setup ]----------------------

    const originalValues = {
        cellHeight,
        cellWidth,
        cellMinHeight,
        cellMinWidth,
        // gap,
        startingIndex,
        startingListSize,
        runwaySize,
        cacheMax,
    }

    // avoid null/undefined
    styles = styles ?? {}
    callbacks = callbacks ?? {}
    technical = technical ?? {}
    startingIndex = startingIndex ?? 0
    startingListSize = startingListSize ?? 0
    runwaySize = runwaySize ?? 3
    usePlaceholder = usePlaceholder ?? true
    useScrollTracker = useScrollTracker ?? true
    cellMinHeight = cellMinHeight ?? 0
    cellMinWidth = cellMinWidth ?? 0
    cacheMax = cacheMax ?? 0

    cellHeight = +cellHeight
    cellWidth = +cellWidth
    cellMinHeight = +cellMinHeight
    cellMinWidth = +cellMinWidth
    // gap = +gap
    const paddingPropsRef = useRef({
        top:null,
        right:null,
        bottom:null,
        left:null,
        source:null,
        original:null,
        list:[],
        CSS:'',
    })
    let paddingProps = paddingPropsRef.current
    if (String(props.padding) !== String(paddingProps.source)) {
        paddingProps.source = props.padding
        if (!Array.isArray(padding)) {
            padding = +padding
            if (!isNaN(padding)) {
                paddingProps.original = [padding]
            } else {
                paddingProps.original = [0]
            }
        } else {
            let isProblem = false
            if (padding.length > 4) {
                isProblem = true
            }
            if (!isProblem) padding.forEach((value,index,list) => {
                if (isNaN(value)) {
                    isProblem = true
                }
            })
            if (!isProblem) {
                paddingProps.original = padding
            } else {
                paddingProps.original = [0]
            }
        }
        const list = [...paddingProps.original]
        paddingProps.CSS = list.join('px ') + 'px'
        const lgth = list.length
        let a,b,c
        switch (lgth) {
        case 1:
            [a] = list // t/b/r/l
            list.push(a,a,a) //r,b,l
            break
        case 2:
            [a,b] = list // t/b, r/l
            list.push(a,b) //b,l
        case 3:
            [a,b] = list // t, r/l, b
            list.push(b) //l
        }
        paddingProps.list = list
        const [top, right, bottom, left] = list
        Object.assign(paddingProps,{top:+top,right:+right,bottom:+bottom,left:+left}) // assure numeric
        paddingPropsRef.current = paddingProps = {...paddingProps} // signal change to React
    }
    const gapPropsRef = useRef({
        column:null,
        row:null,
        source:null,
        original:null,
        list:[],
        CSS:'',
    })
    let gapProps = gapPropsRef.current
    if (String(props.gap) !== String(gapProps.source)) {
        gapProps.source = props.gap
        if (!Array.isArray(gap)) {
            gap = +gap
            if (!isNaN(gap)) {
                gapProps.original = [gap]
            } else {
                gapProps.original = [0]
            }
        } else {
            let isProblem = false
            if (gap.length > 2) {
                isProblem = true
            }
            if (!isProblem) gap.forEach((value,index,list) => {
                if (isNaN(value)) {
                    isProblem = true
                }
            })
            if (!isProblem) {
                gapProps.original = gap
            } else {
                gapProps.original = [0]
            }
        }
        const list = [...gapProps.original]
        gapProps.CSS = list.join('px ') + 'px'
        const lgth = list.length
        let a
        if (lgth == 1) {
            [a] = list // t/b/r/l
            list.push(a) //r,b,l
        }
        gapProps.list = list
        const [column, row] = list
        Object.assign(gapProps,{column:+column,row:+row}) // assure numeric
        gapPropsRef.current = gapProps = {...gapProps} // signal change to React
    }
    startingIndex = +startingIndex
    startingListSize = +startingListSize
    runwaySize = +runwaySize
    cacheMax = +cacheMax

    const verifiedValues = {
        cellHeight,
        cellWidth,
        cellMinHeight,
        cellMinWidth,
        // gap,
        startingIndex,
        startingListSize,
        runwaySize,
        cacheMax,        
    }

    cellMinHeight = Math.max(cellMinHeight, 25)
    cellMinWidth = Math.max(cellMinWidth, 25)
    cellMinHeight = Math.min(cellHeight, cellMinHeight)
    cellMinWidth = Math.min(cellWidth, cellMinWidth)

    // prop constraints - non-negative values
    runwaySize = Math.max(1,runwaySize) // runwaysize must be at least 1
    startingListSize = Math.max(0,startingListSize)
    startingIndex = Math.max(0,startingIndex)

    // package
    let problems = 0
    for (const prop in verifiedValues) {
        if (isNaN(verifiedValues[prop])) {
            problems++
        } 
    }

    if (problems) {
        console.error('Error: invalid number - compare originalValues and verifiedValues', 
            originalValues, verifiedValues)
    }

    // rationalize startingListsize and startingListRange
    if (!problems && scrollerState == 'setup') {

        let goodrange = true
        if (!startingListRange || 
            !Array.isArray(startingListRange) || 
            !((startingListRange.length == 2) || (startingListRange.length == 0))) {
            goodrange = false
        }
        if (goodrange) {
            if (startingListRange.length == 0) {
                startingListSize = 0
            } else {
                let [lowindex,highindex] = startingListRange
                lowindex = +lowindex
                highindex = +highindex
                if (isNaN(lowindex) || isNaN(highindex)) {
                    goodrange = false
                } else if (lowindex > highindex) {
                    goodrange = false
                }
                if (goodrange) {
                    startingListSize = highindex - lowindex + 1
                }
            }
        }
        if (!goodrange) {
            if (startingListSize && (!isNaN(startingListSize))) {
                startingListRange = [0,startingListSize - 1]
            } else {
                startingListRange = []
                startingListSize = 0
            }
        }
    }

    // enums
    if (!['horizontal','vertical'].includes(orientation)) { 
        orientation = 'vertical'
    }
    if (!['preload','keepload','cradle'].includes(cache)) {
        cache = 'cradle'
    }
    if (!['uniform', 'variable'].includes(layout)) {
        layout = 'uniform'
    }

    const gridSpecs = {
        orientation,
        // gap,
        cellHeight,
        cellWidth,
        cellMinHeight,
        cellMinWidth,
        layout,
    }

    const gridSpecsRef = useRef(gridSpecs)

    // system
    const 
        stylesRef = useRef(styles),
        callbacksRef = useRef(callbacks),
        placeholderMessagesRef = useRef(placeholderMessages)

    let {

        showAxis, // boolean; axis can be made visible for debug
        triggerlineOffset, // distance from cell head or tail for content shifts above/below axis
        // timeouts
        VIEWPORT_RESIZE_TIMEOUT,
        ONAFTERSCROLL_TIMEOUT,
        IDLECALLBACK_TIMEOUT,
        VARIABLE_MEASUREMENTS_TIMEOUT,
        // ratios:
        MAX_CACHE_OVER_RUN, // max streaming over-run as ratio to cacheMax
        CACHE_PARTITION_SIZE, 

    } = technical

    VIEWPORT_RESIZE_TIMEOUT = VIEWPORT_RESIZE_TIMEOUT ?? 250
    ONAFTERSCROLL_TIMEOUT = ONAFTERSCROLL_TIMEOUT ?? 100
    IDLECALLBACK_TIMEOUT = IDLECALLBACK_TIMEOUT ?? 250
    VARIABLE_MEASUREMENTS_TIMEOUT = VARIABLE_MEASUREMENTS_TIMEOUT ?? 250
    
    MAX_CACHE_OVER_RUN = MAX_CACHE_OVER_RUN ?? 1.5
    CACHE_PARTITION_SIZE = CACHE_PARTITION_SIZE ?? 30

    if (typeof showAxis != 'boolean') showAxis = false

    triggerlineOffset = triggerlineOffset ?? 10

    if (typeof usePlaceholder != 'boolean') usePlaceholder = true
    if (typeof useScrollTracker != 'boolean') useScrollTracker = true

    const 
        // for mount version
        scrollerSessionIDRef = useRef(null),
        scrollerID = scrollerSessionIDRef.current,

        // for children
        cacheAPIRef = useRef(cacheAPI),

        updateFunctionRef = useRef(null),

        listSizeRef = useRef(startingListSize),
        listRangeRef = useRef(startingListRange),

        listsize = listSizeRef.current,
        listrange = listRangeRef.current,
        [lowlistrange, highlistrange] = listrange, // ranges undefined if listrange length is 0

        virtualListSpecs = {
            size:listsize,
            range:listrange,
            lowindex:lowlistrange,
            highindex:highlistrange,
        },

        virtualListSpecsRef = useRef(virtualListSpecs),

        scrollerDndOptionsRef = useRef({scrollerID,dndOptions})


    if (!compareProps(virtualListSpecs, virtualListSpecsRef.current)) {
        virtualListSpecsRef.current = virtualListSpecs
    }

    // tests for React with Object.is for changed properties; avoid re-renders with no change
    if (!compareProps(gridSpecs, gridSpecsRef.current)) {
        gridSpecsRef.current = gridSpecs
    }

    if (!compareProps(styles, stylesRef.current)) {
        stylesRef.current = styles
    }
    if (!compareProps(callbacks, callbacksRef.current)) {
        callbacksRef.current = callbacks
    }
    if (!compareProps(placeholderMessages, placeholderMessagesRef.current)) {
        placeholderMessagesRef.current = placeholderMessages
    }

    // -------------------------[ Initialization ]-------------------------------

    const getCacheAPI = (cacheAPI) => {

        cacheAPIRef.current = cacheAPI

    }

    const getUpdateFunction = (fn) => {

        updateFunctionRef.current = fn

    }

    const useLocalCache = !cacheAPI

    const isMountedRef = useRef(true)

    useEffect(()=>{

        isMountedRef.current = true

        return () => {

            isMountedRef.current = false

        }

    },[])

    useEffect (() => {

        if (scrollerSessionIDRef.current === null) { // defend against React.StrictMode double run
            scrollerDndOptionsRef.current.scrollerID = scrollerSessionIDRef.current = globalScrollerID++
        }

    },[]);

    const setVirtualListRange = useCallback((listrange) =>{

        let listsize
        if (listrange.length == 0) {
            listsize = 0
        } else {
            const [lowrange, highrange] = listrange
            listsize = highrange - lowrange + 1
        }

        listSizeRef.current = listsize
        listRangeRef.current = listrange

        // inform the user
        callbacksRef.current.changeListRangeCallback && 
            callbacksRef.current.changeListRangeCallback(listrange)

        setScrollerState('setlistprops')

    },[])

    // called when getItem returns null, or direct call from user (see serviceHandler)
    const setVirtualListSize = useCallback((listsize) =>{

        let listrange = listRangeRef.current
        if (listsize == 0) {
            listrange = []
        } else {
            if (listrange.length == 0) {
                listrange = [0,listsize - 1]
            } else {
                const [lowindex/*,highindex*/] = listRangeRef.current
                listrange = [lowindex,lowindex + listsize - 1]
            }
        }

        listSizeRef.current = listsize
        listRangeRef.current = listrange

        // inform the user
        callbacksRef.current.changeListSizeCallback && 
            callbacksRef.current.changeListSizeCallback(listsize)

        setScrollerState('setlistprops')

    },[])

    // ---------------------[ State handling ]------------------------

    const itemSetRef = useRef(null)

    useEffect(() => {

        switch (scrollerState) {

            case 'setup':
                // replace cacheAPI with facade which includes hidden scrollerID
                cacheAPIRef.current = cacheAPIRef.current.registerScroller(scrollerSessionIDRef.current)
                itemSetRef.current = cacheAPIRef.current.itemSet // for unmount unRegisterScroller

                if (updateFunctionRef.current) { // obtained from PortalCache

                    cacheAPIRef.current.partitionRepoForceUpdate = updateFunctionRef.current

                }

            case 'setlistprops':
                setScrollerState('ready')

        }

        return () => {

            if (!isMountedRef.current) {

                cacheAPIRef.current.unRegisterScroller(itemSetRef.current)

            }

        }

    },[scrollerState])

    // --------------------[ Render ]---------------------

    if (problems || isMinimalPropsFail) {
        return <div>error: see console.</div>        
    }

    // console.log('scrollerID', scrollerID)

    // component calls are deferred by scrollerState to give cacheAPI a chance to initialize
    return <ScrollerDndOptions.Provider value = {scrollerDndOptionsRef.current} >
    <ErrorBoundary
        FallbackComponent= { ErrorFallback }
        // elaboration TBD
        onReset = { () => {} }
        onError = { () => {} }
        // onError = {(error: Error, info: {componentStack: string}) => {
        //     console.log('react-infinite-grid-scroller captured error', error)
        // }}
    >

        {(scrollerState != 'setup') && <Viewport

            gridSpecs = { gridSpecsRef.current }
            styles = { stylesRef.current }
            scrollerID = { scrollerID }
            VIEWPORT_RESIZE_TIMEOUT = { VIEWPORT_RESIZE_TIMEOUT }
            useScrollTracker = { useScrollTracker }

        >
        
            <Scrollblock

                gridSpecs = { gridSpecsRef.current }
                paddingProps = {paddingProps}
                gapProps = { gapProps }
                styles = { stylesRef.current }
                virtualListSpecs = {virtualListSpecsRef.current}
                scrollerID = { scrollerID }
                
            >
                <CradleController 

                    gridSpecs = { gridSpecsRef.current }
                    paddingProps = { paddingProps }
                    gapProps = { gapProps }
                    styles = { stylesRef.current }
                    virtualListSpecs = {virtualListSpecsRef.current}
                    setVirtualListSize = { setVirtualListSize }
                    setVirtualListRange = { setVirtualListRange }
                    cache = { cache }
                    cacheMax = { cacheMax }
                    userCallbacks = { callbacksRef.current }
                    startingIndex = { startingIndex }
                    getItem = { getItem }
                    getItemPack = { getItemPack }
                    getExpansionCount = { getExpansionCount }
                    placeholder = { placeholder }
                    placeholderMessages = { placeholderMessagesRef.current }
                    runwaySize = { runwaySize }
                    triggerlineOffset = { triggerlineOffset }
                    scrollerProperties = { scrollerProperties }

                    cacheAPI = { cacheAPIRef.current }
                    usePlaceholder = { usePlaceholder }
                    // useScrollTracker = { useScrollTracker }
                    showAxis = { showAxis }
                    ONAFTERSCROLL_TIMEOUT = { ONAFTERSCROLL_TIMEOUT }
                    IDLECALLBACK_TIMEOUT = { IDLECALLBACK_TIMEOUT }
                    MAX_CACHE_OVER_RUN = { MAX_CACHE_OVER_RUN }
                    VARIABLE_MEASUREMENTS_TIMEOUT = { VARIABLE_MEASUREMENTS_TIMEOUT }
                    scrollerID = { scrollerID }

                />
            </Scrollblock>
        </Viewport>}
        <div>
            {useLocalCache && <div data-type = 'cacheroot' style = { cacherootstyle }>
                <PortalCache 

                    getCacheAPI = { getCacheAPI } 
                    getUpdateFunction = { getUpdateFunction }
                    CACHE_PARTITION_SIZE = { CACHE_PARTITION_SIZE } />

            </div>}
        </div>
    </ErrorBoundary>
    </ScrollerDndOptions.Provider>
}

// ----------------------------[ Support ]------------------------------

const cacherootstyle = {display:'none'} // static, out of view 

// utility
function compareProps (obj1,obj2) {
    if (!obj1 || !obj2) return false
    const keys = Object.keys(obj1)
    for (const key of keys) {
        if (!Object.is(obj1[key],obj2[key])) {
            return false
        }
    }
    return true
}
