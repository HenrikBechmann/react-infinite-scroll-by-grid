// contentfunctions.tsx
// copyright (c) 2019-2022 Henrik Bechmann, Toronto, Licence: MIT

/*
    This module supports the contenthandler module. The functions in this module perform
    the detailed calculations and processes required by the contenthandler.

    getContentListRequirements is called by the contenthandler's setCradleContent function.

    getShiftInstruction and calcContentShift are called by contentHandler's updateCradleContent
    function. 
    
    getCellFrameComponentList, allocateContentList, and deletePortals functions are shared by both. 

    createCellFrame is called internally by getCellFrameComponentList as needed.
*/

import React from 'react'

import CellFrame from '../CellFrame'

// ======================[ for setCradleContent ]===========================

export const getContentListRequirements = ({ // called from setCradleContent only

        // index
        targetAxisReferenceIndex, // from user, or from pivot
        // pixels
        baseRowLength,
        targetAxisViewportPixelOffset,
        // resources
        cradleInheritedProperties,
        cradleInternalProperties,

    }) => {

    const { 
        // orientation, 
        // cellHeight, 
        // cellWidth, 
        // gap,
        padding,
    } = cradleInheritedProperties

    const {

        crosscount,
        cradleRowcount,
        runwayRowcount,
        listRowcount,
        listsize,
        viewportVisibleRowcount,

    } = cradleInternalProperties
    
    // align axis reference to first row item
    targetAxisReferenceIndex = Math.min(targetAxisReferenceIndex,listsize - 1)
    targetAxisReferenceIndex -= (targetAxisReferenceIndex % crosscount)

    // derive target row
    let targetAxisRowOffset = Math.ceil(targetAxisReferenceIndex/crosscount)

    const maxAxisRowOffset = Math.max(0,listRowcount - viewportVisibleRowcount)
    if (targetAxisRowOffset > maxAxisRowOffset) {
        targetAxisRowOffset = maxAxisRowOffset
        targetAxisReferenceIndex = targetAxisRowOffset * crosscount
    }

    // -----------------------[ calc cradleReferenceRow & Index ]------------------------

    // leading edge
    let targetCradleRowOffset = Math.max(0,targetAxisRowOffset - runwayRowcount)

    // trailing edge
    let targetCradleEndRowOffset = targetCradleRowOffset + (cradleRowcount - 1)

    const listEndRowOffset = (listRowcount - 1)

    if (targetCradleEndRowOffset > (listEndRowOffset)) {
        const diff = (targetCradleEndRowOffset - listEndRowOffset)
        targetCradleRowOffset -= diff
        targetCradleEndRowOffset -= diff
    }

    const targetCradleReferenceIndex = targetCradleRowOffset * crosscount

    // ---------------------[ calc cradle content count ]---------------------

    let newCradleContentCount = cradleRowcount * crosscount
    if (targetCradleEndRowOffset == listEndRowOffset) {
        const endRowRemainderCount = listsize % crosscount
        if (endRowRemainderCount) {
            newCradleContentCount -= (crosscount - endRowRemainderCount)
        }
    }

    // --------------------[ calc css positioning ]-----------------------

    const targetScrollblockViewportPixelOffset = 
        (targetAxisRowOffset * baseRowLength) + padding - targetAxisViewportPixelOffset

    // ----------------------[ return required values ]---------------------

    return {
        targetCradleReferenceIndex, 
        targetAxisReferenceIndex,
        targetScrollblockViewportPixelOffset, 
        newCradleContentCount, 
    } 

}

// ======================[ for updateCradleContent ]===========================

/*
    - If the top of the cell row moves beyond the viewport boundary, then the 
        content should push the cell boundary up
    - If the top of the cell row moves into the viewport boundary, then the
        content should push the cell boundary down
*/
// -1 = shift row to head. 1 = shift row to tail. 0 = do not shift a row.
export const getShiftInstruction = ({

    blockScrollingDirection,
    orientation,
    triggerlineEntries,
    triggerlineSpan,
    scrollerID, // for debug
    
    // for oversized (overflow) cells
    oldAxisReferenceIndex,
    viewportVisibleRowcount,
    crosscount,
    listsize,

    // reverseDirection is true if the triggerlines are with the first tail row instead of the
    // last headrow. That happens (workaround) when there are no head rows
    reverseDirection, 

}) => {

    // console.log('getShiftInstruction: reverseDirection, blockScrollingDirection, triggerlineEntries', 
    //     reverseDirection, blockScrollingDirection, triggerlineEntries)

    const direction = 
        blockScrollingDirection //?
            // 'forward':
            // 'backward'

    const entries = triggerlineEntries.filter(entry => {
        // const isIntersecting = entry.isIntersecting
        const triggerlinename = entry.target.dataset.type
        entry.triggerlinename = triggerlinename // memo for processing and console

        const triggerlinedirection = entry.target.dataset.direction
        entry.triggerlinedirection = triggerlinedirection

        entry.scrollingdirection = blockScrollingDirection // memo for console

        const rootpos = 
            (orientation == 'vertical')?
                entry.rootBounds.y:
                entry.rootBounds.x

        const entrypos = 
            (orientation == 'vertical')?
                entry.boundingClientRect.y:
                entry.boundingClientRect.x

        // trigger is negative is block is scrolling backward, otherwise positive
        const viewportTriggerOffset = entrypos - rootpos
        entry.viewportoffset = viewportTriggerOffset

        // console.log('triggerlinename, triggerlinedirection, direction, viewportoffset',
        //     triggerlinename, triggerlinedirection, direction, viewportoffset)

        // axis needs to be moved if:
        return (

            // - axis triggerline goes out of scope, or...
            direction == 'backward' &&
            (reverseDirection?(triggerlinedirection == 'forward'):(triggerlinedirection == 'backward')) &&
            viewportTriggerOffset <= 0

        ) || (

            // - head triggerline comes into scope
            direction == 'forward' &&
            (reverseDirection?(triggerlinedirection == 'backward'):(triggerlinedirection == 'forward')) &&
            viewportTriggerOffset >= 0

        )

    })

    // console.log('filtered entries', entries)

    let retval

    // the triggerline might have passed through the viewport completely without the
    // change being triggered, eg. not intersecting, passing through viewport, then
    //    not intersecting again before being intercepted
    // in this case we rely on the counterentry to provide information
    if (entries.length == 0) { // short-circuit the evaluation

        const counterdirection = 
        (blockScrollingDirection == 'forward')?
            'backward':        
            'forward'

        const counterentries = triggerlineEntries.filter(entry => entry.triggerdirection == counterdirection)

        if (counterentries.length != 0) {
            // check for implied trigger - trigger can be bypassed with heavy components
            const counterentry =  counterentries.pop()
            const countertriggerlinedirection = counterentry.triggerlinedirection

            let impliedoffset
            if ((countertriggerlinedirection == 'forward') &&
                (reverseDirection?(direction == 'backward'):(direction == 'forward')))

            {

                impliedoffset = counterentry.viewportoffsethead + triggerlineSpan

                if (impliedoffset <= 0) {

                    retval = -1

                }

            } else { 

                impliedoffset = counterentry.viewportoffsethead - triggerlineSpan

                if (impliedoffset >= 0) {

                    retval = 1

                }

            }

        }

        retval = 0

    } else { // complete the evaluation

        const entry = entries[0] // assume one record gets filtered; only paired above on reconnect

        if (direction == 'forward') {

            retval = 1 // shift row to tail

        } else {

            retval = -1 // shift row to head

        }

    }

    // check for last oversize row when scrollbock scrolling toward end
    // TODO review this logic
    if ((retval !=0) && (blockScrollingDirection == 'backward') && (viewportVisibleRowcount == 0)) {
        if ((listsize - crosscount) <= oldAxisReferenceIndex) {

            retval = 0

        }
    }

    // console.log('returning shift instruction', retval)

    return retval
}

// A negative shift instruction is movement into the head, a positive shift is movement into the tail.
// called only from updateCradleContent
export const calcContentShift = ({

    shiftinstruction,
    cradleInheritedProperties,
    cradleInternalProperties,
    cradleContent,
    cradleElements,
    scrollPos, // of cradle against viewport; where the cradle motion intersects the viewport
    viewportElement,

}) => {

    // ------------------------[ 1. initialize ]-----------------------

    const blockScrollingDirection = 
        (shiftinstruction > 0)?
            'forward':
            'backward'

    const { 

        gap,
        orientation,
        cellHeight,
        cellWidth,
        triggerlineOffset,

    } = cradleInheritedProperties

    const axisElement = cradleElements.axisRef.current,
        headGridElement = cradleElements.headRef.current,
        tailGridElement = cradleElements.tailRef.current

    const {

        cradleModelComponents:cradlecontentlist, 
        tailModelComponents:tailcontentlist,

    } = cradleContent

    const { 

        crosscount,
        cradleRowcount,
        listsize,
        listRowcount,
        viewportRowcount,
        runwayRowcount,

    } = cradleInternalProperties

    const referenceGridElement = 
        (blockScrollingDirection == 'backward')?
            tailGridElement:
            headGridElement


    const gridRowLengths = getGridRowLengths(referenceGridElement, orientation, crosscount, gap)

    if (blockScrollingDirection == 'forward')
        gridRowLengths.reverse()

    const gridRowSpans = getGridRowSpans(gridRowLengths)

    const baseRowLength =
        ((orientation == 'vertical')?
            cellHeight:
            cellWidth) 
        + gap

    const firstRowLength = gridRowLengths[0] ?? baseRowLength // baseRowLength for start of list

    // -----------[ 2. calculate axis reference row shift ]-------------------
    // gaps beyond rendered rows can be caused by rapid scrolling

    const scrollblockAxisOffset = 
        (orientation == 'vertical')?
            axisElement.offsetTop:
            axisElement.offsetLeft

    const scrollblockElement = viewportElement.firstChild
    const scrollblockOffset = // to capture current top/left adjustment to viewport for variable layout
        (orientation == 'vertical')?
            scrollblockElement.offsetTop:
            scrollblockElement.offsetLeft

    // currentViewportAxisOffset will be negative (above viewport edge) for scroll block backward 
    //     and positive for scroll block forward
    // the pixel distance between the viewport frame and the axis, toward the head
    const currentViewportAxisOffset = 
        scrollblockAxisOffset + scrollblockOffset - scrollPos

    // the location of the active trigger
    const notionalActiveTriggerPos = 
        (blockScrollingDirection == 'backward')?
            currentViewportAxisOffset + triggerlineOffset:
            // (firstRowLength === undefined)?
            //     currentViewportAxisOffset + triggerlineOffset:
                currentViewportAxisOffset - (firstRowLength - triggerlineOffset)        

    console.log('calcContentShift:blockScrollingDirection, currentViewportAxisOffset, notionalActiveTriggerPos',
        blockScrollingDirection, currentViewportAxisOffset, notionalActiveTriggerPos)

    const spanRowPtr = 
        (blockScrollingDirection == 'backward')?
            gridRowSpans.findIndex((span) => -(span - triggerlineOffset) < notionalActiveTriggerPos):
            gridRowSpans.findIndex((span) => (span - triggerlineOffset) > notionalActiveTriggerPos)

    let spanPtr, // used to calc spanRowShift below
        spanAxisPixelShift // used to calc newAxisPixelOffset below
    if (spanRowPtr == -1 ) { // overshoot of instantiated rows; continue with virtual rows
        if (gridRowSpans.length == 0) {
            spanPtr = -1
            spanAxisPixelShift = 0
        } else {

            spanPtr = gridRowSpans.length - 1

            let overshootPixelShift = // set base of working total
                (blockScrollingDirection == 'backward')?
                    -(gridRowSpans.at(-1) - triggerlineOffset): // positive value
                    gridRowSpans.at(-1) - triggerlineOffset // negative value

            if (blockScrollingDirection == 'backward') {

                while (overshootPixelShift > notionalActiveTriggerPos) {
                    overshootPixelShift -= baseRowLength
                    ++spanPtr
                }

                spanAxisPixelShift = overshootPixelShift + triggerlineOffset

            } else {

                while (overshootPixelShift < notionalActiveTriggerPos) {
                    overshootPixelShift += baseRowLength
                    ++spanPtr
                }

                spanAxisPixelShift = overshootPixelShift - triggerlineOffset
            }

        }

    } else { // final values found in instantiated rows

        spanPtr = spanRowPtr
        spanAxisPixelShift = 
            (blockScrollingDirection == 'backward')?
                gridRowSpans[spanPtr]:
                -gridRowSpans[spanPtr]

    }

    const spanRowShift = // pick up row shift with or without overshoot
        (blockScrollingDirection == 'backward')?
            spanPtr + 1:
            -(spanPtr + 1)

    // the following two values, and no other calcs, are carried forward.
    // for axisReferenceRowshift:
    // negative for moving rows out of head into tail;
    // positive for moving rows out of tail into head
    const axisReferenceRowshift = spanRowShift
    const axisPixelShift = spanAxisPixelShift 

    // ------------[ 5. calc new cradle and axis reference row offsets ]-------------

    // base value for cradle reference shift; may change if beyond list bounds
    let cradleReferenceRowshift = axisReferenceRowshift

    const previousCradleReferenceIndex = (cradlecontentlist[0]?.props.index || 0)
    const previousCradleRowOffset = Math.ceil(previousCradleReferenceIndex/crosscount)

    const previousAxisReferenceIndex = (tailcontentlist[0]?.props.index || 0)
    const previousAxisRowOffset = Math.ceil(previousAxisReferenceIndex/crosscount)

    // base values
    let newCradleReferenceRowOffset = previousCradleRowOffset + cradleReferenceRowshift
    let newAxisReferenceRowOffset = previousAxisRowOffset + axisReferenceRowshift

    // sections 6 and 7 deal entirely with row calculations; no pixels
    // --------[ 6. adjust cradle contents for start and end of list ]-------
    // ...to maintain constant number of cradle rows

    const listEndrowOffset = (listRowcount - 1)

    if (blockScrollingDirection == 'backward') {

        // a. if scrolling forward near the start of the list, new cradle row offset and
        // cradle row shift count has to be adjusted to accommodate the leading runway
        // b. if scrolling forward (toward tail of list), as the cradle last row offset approaches 
        // listrow new cradle offset and cradle row shift have to be adjusted to prevent shortening 
        // of cradle content.

        const targetCradleReferenceRowOffset = 
            Math.max(0, (newAxisReferenceRowOffset - runwayRowcount - 1))

        const headrowDiff = newCradleReferenceRowOffset - targetCradleReferenceRowOffset
        if (headrowDiff > 0) {

            newCradleReferenceRowOffset -= headrowDiff
            cradleReferenceRowshift -= headrowDiff

        }
        // case of being in bounds of trailing runway (end of list)
        const targetCradleEndrowOffset = newCradleReferenceRowOffset + (cradleRowcount - 1)
        const tailrowdiff = Math.max(0,targetCradleEndrowOffset - listEndrowOffset)
        if (tailrowdiff > 0) {

            newCradleReferenceRowOffset -= tailrowdiff
            cradleReferenceRowshift -= tailrowdiff

        }

    } else { // blockScrollingDirection = forward

        // c. if scrolling backward (toward head of list), as the cradlerowoffset hits 0, cradle changes have
        // to be adjusted to prevent shortening of cradle content
        // d. if scrolling backward near the start of the list, cradle changes have to be adjusted to accomodate
        // the trailing runway

        if (newCradleReferenceRowOffset < 0) {

            cradleReferenceRowshift -= newCradleReferenceRowOffset
            newCradleReferenceRowOffset = 0

        }
        // case of in bounds of trailing runway (end of list)
        const computedNextCradleEndrowOffset = 
            (previousCradleRowOffset + (cradleRowcount -1) + cradleReferenceRowshift)
        const targetcradleEndrowoffset = Math.min(listEndrowOffset, 
            (newAxisReferenceRowOffset + (viewportRowcount - 1) + (runwayRowcount - 1)))
        const tailrowdiff = Math.max(0, targetcradleEndrowoffset - computedNextCradleEndrowOffset)

        if (tailrowdiff > 0) {

            cradleReferenceRowshift += tailrowdiff
            newCradleReferenceRowOffset += tailrowdiff

        }

    }

    // ----------------------[ 7. map rows to item references ]----------------------

    const newCradleReferenceIndex = (newCradleReferenceRowOffset * crosscount)
    const cradleReferenceItemShift = (cradleReferenceRowshift * crosscount)

    const newAxisReferenceIndex = newAxisReferenceRowOffset * crosscount
    const axisReferenceItemShift = axisReferenceRowshift * crosscount

    let newCradleContentCount = cradleRowcount * crosscount // base count
    const includesLastRow = ((newCradleReferenceRowOffset + cradleRowcount) >= listRowcount)
    if (includesLastRow) {
        const partialspaces = listsize % crosscount
        const itemsShortfall = 
            (partialspaces == 0)?
                0:
                crosscount - partialspaces
        newCradleContentCount -= itemsShortfall
    }

    // create head and tail change counts
    const changeOfCradleContentCount = cradlecontentlist.length - newCradleContentCount

    const listStartChangeCount = -(cradleReferenceItemShift)
    const listEndChangeCount = -listStartChangeCount - (changeOfCradleContentCount)

    // -------------[ 8. calculate new axis pixel position ]------------------

    const newAxisPixelOffset = currentViewportAxisOffset + axisPixelShift

    // ---------------------[ 9. return required values ]-------------------

    return {
        newCradleReferenceIndex, 
        cradleReferenceItemShift, 
        newAxisReferenceIndex, 
        axisReferenceItemShift, 
        newAxisPixelOffset, 
        newCradleContentCount,
        listStartChangeCount,
        listEndChangeCount
    }

}

export const getGridRowLengths = (grid, orientation, crosscount, gap) => {

    const rowLengths = []
    const elementList = grid.childNodes

    let elementPtr = 0
    let element = elementList[elementPtr]
    let span = 0

    while (element) {
        const rowlength = 
            ((orientation == 'vertical')?
                element.offsetHeight:
                element.offsetWidth) 
            + gap
        rowLengths.push(rowlength)
        elementPtr += crosscount
        element = elementList[elementPtr]
    }

    return rowLengths
}

export const getGridRowSpans = (rowLengths) => {

    const rowSpans = []
    let span = 0
    rowLengths.forEach((value) => {
        span += value
        rowSpans.push(span)
    })

    return rowSpans
}

// =====================[ shared by both setCradleContent and updateCradleContent ]====================

// update content
// adds itemshells at end of contentlist according to headindexcount and tailindescount,
// or if indexcount values are <0 removes them.
export const getCellFrameComponentList = ({ 

        cradleInheritedProperties,
        cradleInternalProperties,
        cacheHandler,
        cradleContentCount,
        cradleReferenceIndex, 
        listStartChangeCount, 
        listEndChangeCount, 
        workingContentList:contentlist,
        instanceIdCounterRef,
        styles,
    }) => {

    const localContentlist = [...contentlist]
    const lastindexoffset = cradleReferenceIndex + localContentlist.length - 1

    const headContentlist = [], tailContentlist = []

    let deletedtailitems = [], deletedheaditems = []

    if (listStartChangeCount >= 0) { // acquire new items

        for (let newindex = cradleReferenceIndex - listStartChangeCount; newindex < (cradleReferenceIndex); newindex++) {

            headContentlist.push(
                createCellFrame(
                    {
                        index:newindex, 
                        cradleInheritedProperties,
                        cradleInternalProperties,
                        instanceIdCounterRef,
                        cacheHandler,
                        placeholderFrameStyles:styles.placeholderframe,
                        placeholderContentStyles:styles.placeholdercontent,
                    }
                )
            )

        }

    } else {

        deletedheaditems = localContentlist.splice( 0, -listStartChangeCount )

    }

    if (listEndChangeCount >= 0) { // acquire new items

        for (let newindex = lastindexoffset + 1; newindex < (lastindexoffset + 1 + listEndChangeCount); newindex++) {

            tailContentlist.push(
                createCellFrame(
                    {
                        index:newindex, 
                        cradleInheritedProperties,
                        cradleInternalProperties,
                        instanceIdCounterRef,
                        cacheHandler,
                        placeholderFrameStyles:styles.placeholderframe,
                        placeholderContentStyles:styles.placeholdercontent,
                    }
                )
            )
            
        }

    } else {

        deletedtailitems = localContentlist.splice(listEndChangeCount,-listEndChangeCount)

    }

    const deletedItems = [...deletedheaditems,...deletedtailitems]

    const componentList = [...headContentlist,...localContentlist,...tailContentlist]

    return [componentList,deletedItems]

}

// butterfly model. Leading (head) all or partially hidden; tail, visible plus following hidden
export const allocateContentList = (
    {

        contentlist, // of cradle, in items (React components)
        axisReferenceIndex, // first tail item
        layoutHandler,

    }
) => {

    const { triggercellIndex } = layoutHandler

    const offsetindex = contentlist[0]?.props.index
    const highindex = offsetindex + contentlist.length

    const headitemcount = (axisReferenceIndex - offsetindex)

    const targetTriggercellIndex = 
        (headitemcount == 0)?
            axisReferenceIndex:
            axisReferenceIndex - 1

    layoutHandler.triggercellIsInTail = 
        (headitemcount == 0)?
            true:
            false

    if ((triggercellIndex !== undefined) && (offsetindex !== undefined) && 
       (triggercellIndex != targetTriggercellIndex)) {
        if ((triggercellIndex >= offsetindex) && (triggercellIndex <= highindex)) {
            const triggercellPtr = triggercellIndex - offsetindex
            const triggercellComponent = contentlist[triggercellPtr]
            if (triggercellComponent) { // otherwise has been asynchronously cleared
                contentlist[triggercellPtr] = React.cloneElement(triggercellComponent, {isTriggercell:false})
            }
        }
    }

    const triggercellPtr = targetTriggercellIndex - offsetindex
    const triggercellComponent = contentlist[triggercellPtr]
    // if !triggercellComponent, is temporarily out of scope; will recycle
    if (triggercellComponent && ((triggercellIndex === undefined) || 
        (triggercellIndex != targetTriggercellIndex  ||
        !triggercellComponent.props.isTriggecell))) {    
        contentlist[triggercellPtr] = React.cloneElement(triggercellComponent, {isTriggercell:true})
        layoutHandler.triggercellIndex = targetTriggercellIndex
    } else {
        console.log('FAILURE TO REGISTER TRIGGERCELL: \n',
            'triggercellComponent, triggercellIndex, targetTriggercellIndex, triggercellComponent?.props.isTriggecell\n', 
            triggercellComponent, triggercellIndex, targetTriggercellIndex, triggercellComponent?.props.isTriggecell)
    }

    const headlist = contentlist.slice(0,headitemcount)
    const taillist = contentlist.slice(headitemcount)

    return [ headlist, taillist ]

}

export const deletePortals = (cacheHandler, deleteList, deleteListCallback) => {

    const dlist = deleteList.map((item)=>{

        return item.props.index
        
    })

    cacheHandler.deletePortal(dlist, deleteListCallback)
}

// =====================[ internal, acquire item ]======================

const createCellFrame = ({
    index, 
    cradleInheritedProperties,
    cradleInternalProperties,
    instanceIdCounterRef,
    cacheHandler,
    placeholderFrameStyles,
    placeholderContentStyles,
}) => {
    const instanceID = instanceIdCounterRef.current++

    const { 
        
        orientation,
        cellHeight,
        cellWidth,
        varHeightMin,
        varWidthMin,
        getItem,
        placeholder,
        scrollerID,
        layout, 

    } = cradleInheritedProperties

    const { listsize } = cradleInternalProperties

    // get new or existing itemID
    const itemID = cacheHandler.getNewOrExistingItemID(index)

    return <CellFrame 
        key = { instanceID } 
        orientation = { orientation }
        cellHeight = { cellHeight }
        cellWidth = { cellWidth }
        varHeightMin = { varHeightMin }
        varWidthMin = { varWidthMin }
        layout = { layout }
        index = { index }
        getItem = { getItem }
        listsize = { listsize }
        placeholder = { placeholder }
        itemID = { itemID }
        instanceID = { instanceID }
        scrollerID = { scrollerID }
        isTriggercell = { false }
        placeholderFrameStyles = { placeholderFrameStyles }
        placeholderContentStyles = { placeholderContentStyles }
    />

}
