// DndViewport.tsx
// copyright (c) 2019-2023 Henrik Bechmann, Toronto, Licence: MIT

/*

    The role of DndViewport is to calculate whether DndScrollTabs should be shown (isOver && canDrop viewport)
    Obtain dnd targetConnector (viewportFrameElementRef.current) from Viewport

*/

import React, {useEffect, useContext, useRef, useState } from 'react'

import { useDrop, DropTargetMonitor} from 'react-dnd'

import { ScrollerDndContext, GenericObject } from '../InfiniteGridScroller'

import { Viewport } from '../Viewport'

// HoC for DnD functionality
const DndViewport = (props) => {

    const [ dndViewportState, setDndViewportState] = useState('ready')

    const { scrollerID } = props

    const scrollerDndContext = useContext(ScrollerDndContext)

    const viewportFrameElementRef = useRef(null)
    const outerViewportElementRef = useRef(null)

    const showScrollTabsRef = useRef(false)

    const [ targetData, targetConnector ] = useDrop({
        accept:scrollerDndContext.dndOptions.accept || ['-x-x-x-'],
        drop:(item, monitor) => {
            if (monitor.isOver({shallow:true})) {
                return {
                    dataType:'viewport',
                    target:{
                        scrollerID,
                    }
                }
            }
        },
        hover:(item, monitor) => {

            if (!monitor.isOver({shallow:true}) || !monitor.canDrop()) {
                // not on whitespace
                return

            }

            const [onWhitespace, position] = isOnWhitespace(monitor.getClientOffset())

            console.log('onWhitespace, position', onWhitespace, position)

            if (!onWhitespace) {

                return

            } else {

            }

        },
        collect:(monitor:DropTargetMonitor) => {
            return {

                isOver:monitor.isOver(),
                canDrop:monitor.canDrop(),

            }
        },

    })

    // TODO take gap into account
    const isOnWhitespace = (clientOffset:{x:number, y:number}) => {
        const 
            { cradleParameters } = scrollerDndContext,
            cradleInternalProperties = cradleParameters.cradleInternalPropertiesRef.current,
            { virtualListProps } = cradleInternalProperties,
            { 
                size:listsize, 
                crosscount, 
                baserowblanks, 
                endrowblanks, 
                lowindex:lowlistindex, 
                highindex:highlistindex,
                rowcount:listrowcount,
                rowshift,

            } = virtualListProps

        // console.log('listsize',listsize)
        if (listsize === 0) {

            return [true,'all'] // nothing but whitespace

        }

        const 
            { cradleContentProps } = cradleInternalProperties,
            { 
                viewportRowcount, 
                cradleRowcount, 
                lowindex:lowcradleindex, 
                highindex:highcradleindex,
                lowrow,
                highrow,

            } = cradleContentProps

        // check for cradle boundary
        if (

            cradleRowcount > viewportRowcount && 
            lowrow > 0 &&
            highrow < (listrowcount - 1)

        ) {

            return [false,null] // no white space is possible
        }

        // check for baserow and endrow blanks
        // if (

        //     !((lowrow === 0 && baserowblanks !== 0) ||
        //     (highrow === (listrowcount - 1) && endrowblanks !== 0))

        // ) {

        //     return [false,null] // no white space is possible

        // }

        // test cursor position
        const 
            // collect basic data
            { layoutHandler } = cradleParameters.handlersRef.current,
            { axisRef, headRef, tailRef } = layoutHandler.elements,
            axisRect = axisRef.current.getBoundingClientRect(),
            axisClientOffset = {
                x:axisRect.x,
                y:axisRect.y,
            },
            cradleInheritedProperties = cradleParameters.cradleInheritedPropertiesRef.current,
            { orientation } = cradleInheritedProperties,
            // determine which grid is under cursor
            isInHeadGrid = // otherwise tail grid
                orientation == 'vertical'?
                    clientOffset.x < axisClientOffset.x:
                    clientOffset.y < axisClientOffset.y

        // collect reference grid cells
        let firstChildCellElement, lastChildCellElement

        if (isInHeadGrid) {
            firstChildCellElement = headRef.current.firstChild
        } else {
            firstChildCellElement = tailRef.current.firstChild
            lastChildCellElement = tailRef.current.lastChild
        }

        if (!firstChildCellElement) return [false, null]

        // ------- determine if in head whitespace
        const 
            firstChildCellElementRect = firstChildCellElement.getBoundingClientRect(),
            firstChildClientOffset = {
                x:firstChildCellElementRect.x,
                y:firstChildCellElementRect.y,
                height:firstChildCellElementRect.height,
                width:firstChildCellElementRect.width
            }

        // check whitespace in blank cells
        let isWhitespace = 
            orientation == 'vertical'?
                clientOffset.x < firstChildClientOffset.x && 
                    clientOffset.y < (firstChildClientOffset.y + firstChildClientOffset.height):
                clientOffset.y < firstChildClientOffset.y && 
                    clientOffset.x < (firstChildClientOffset.x + firstChildClientOffset.width)

        if (!isWhitespace) { // check for position before list (such as in padding area)

            isWhitespace = 
                (orientation == 'vertical')?
                    clientOffset.y < firstChildClientOffset.y:
                    clientOffset.x < firstChildClientOffset.x
        
        }

        if (isWhitespace) return [true,'head']

        // ------- determine if in tail whitespace
        if (!lastChildCellElement) return [false, null]

        // in blank cells
        const 
            lastChildCellElementRect = lastChildCellElement.getBoundingClientRect(),
            lastChildClientOffset = {
                x:lastChildCellElementRect.x,
                y:lastChildCellElementRect.y,
                height:lastChildCellElementRect.height,
                width:lastChildCellElementRect.width
            }
        isWhitespace = 
            orientation == 'vertical'?
                clientOffset.x > lastChildClientOffset.x &&
                    clientOffset.y > lastChildClientOffset.y:
                clientOffset.y > lastChildClientOffset.y &&
                    clientOffset.x > lastChildClientOffset.x

        if (isWhitespace) return [true,'tail']

        // beyond blank cell row
        // TODO take gap into account
        isWhitespace = 
            orientation == 'vertical'?
                clientOffset.y > (lastChildClientOffset.y + lastChildClientOffset.height):
                clientOffset.x > (lastChildClientOffset.x + lastChildClientOffset.width)

        if (isWhitespace) return [true,'tail']

        // not in white space
        return [false,null]

    }

    useEffect(()=>{

        const viewportFrameElement = viewportFrameElementRef.current

        if ( targetData.isOver && targetData.canDrop ) {
            viewportFrameElement.classList.add('rigs-viewport-highlight')
            showScrollTabsRef.current = true
        } else {
            viewportFrameElement.classList.remove('rigs-viewport-highlight')
            showScrollTabsRef.current = false
        }
        if ( !targetData.isOver && targetData.canDrop ) {
            viewportFrameElement.classList.add('rigs-viewport-candrop')
        } else {
            viewportFrameElement.classList.remove('rigs-viewport-candrop')
        }
        setDndViewportState('updatehighlight')

    },[targetData.isOver, targetData.canDrop])

    useEffect(()=>{

        targetConnector(viewportFrameElementRef.current)

    },[])

    useEffect(()=>{
        switch (dndViewportState) {
            case 'updatehighlight':{

                setDndViewportState('ready')
                break
            }
        }

    },[dndViewportState])

    const enhancedProps = {...props,viewportFrameElementRef, outerViewportElementRef, showScrollTabs:showScrollTabsRef.current}

    return <Viewport {...enhancedProps}/>

}

export default DndViewport